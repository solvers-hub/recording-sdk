/**
 * RecordingManager: Main entry point for the Recording SDK
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
    RecordingManagerConfig,
    RecordingSessionOptions,
    RecordingResult,
    LogLevel,
    KurentoClient,
    KurentoConnectionOptions
} from '../types';
import { Logger, ConfigManager, ILogger } from '../utils';
import { KurentoConnector, KurentoConnectorEvent } from './KurentoConnector';
import { MediaPipeline } from './MediaPipeline';
import { RecordingSession } from './RecordingSession';
import { ConfigError, ConnectionError, SessionError } from '../errors';
import {
    DEFAULT_MANAGER_CONFIG,
    DEFAULT_SESSION_OPTIONS,
    ErrorCode
} from '../constants';
import { WebRTCHandler } from './WebRTCHandler';

const mkdir = promisify(fs.mkdir);
const exists = promisify(fs.exists);

/**
 * Events emitted by RecordingManager
 */
export enum RecordingManagerEvent {
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    RECONNECTING = 'reconnecting',
    CONNECTION_FAILED = 'connection-failed',
    SESSION_CREATED = 'session-created',
    SESSION_ENDED = 'session-ended',
    ERROR = 'error',
    PIPELINE_PRESERVED = 'pipeline-preserved',
    PIPELINE_RELEASED = 'pipeline-released',
    RECONNECTION_TIMED_OUT = 'reconnection-timed-out'
}

/**
 * Main class for the Recording SDK
 * This is the entry point for developers using the SDK
 */
export class RecordingManager extends EventEmitter {
    private config: Required<RecordingManagerConfig>;
    private logger: Logger;
    private configManager: ConfigManager;
    private kurentoConnector: KurentoConnector | null = null;
    private sessions: Map<string, RecordingSession> = new Map();
    private isInitialized: boolean = false;
    private disconnectionTimestamp: number | null = null;
    private pipelineReleaseTimers: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Create a new RecordingManager
     * 
     * @param config Configuration options
     */
    constructor(config: RecordingManagerConfig) {
        super();

        // Create logger first - either use the provided external logger or create our default one
        this.logger = this.initializeLogger(config);

        // Create config manager with the logger
        this.configManager = new ConfigManager(this.logger);

        // Validate and normalize config
        this.config = this.configManager.validateManagerConfig(config);

        this.logger.info('RecordingManager initialized', {
            kurentoUrl: this.config.kurentoUrl,
            logLevel: this.config.logLevel,
            preservePipelinesOnDisconnect: this.config.preservePipelinesOnDisconnect,
            maxReconnectionTimeMs: this.config.maxReconnectionTimeMs
        });
    }

    /**
     * Initialize the logger based on configuration
     * 
     * @param config Recording manager configuration
     * @returns Logger instance
     */
    private initializeLogger(config: RecordingManagerConfig): Logger {
        if (config.logger) {
            // Use external logger if provided
            this.logger = new Logger({
                name: 'RecordingManager',
                externalLogger: config.logger as ILogger
            });
            this.logger.info('Using external logger');
            return this.logger;
        } else {
            // Create default internal logger
            return new Logger({
                name: 'RecordingManager',
                level: config.logLevel || DEFAULT_MANAGER_CONFIG.logLevel,
                prettyPrint: process.env.NODE_ENV !== 'production'
            });
        }
    }

    /**
     * Connect to Kurento Media Server
     */
    async connect(): Promise<void> {
        if (this.kurentoConnector && this.kurentoConnector.isConnected()) {
            this.logger.debug('Already connected to Kurento Media Server');
            return;
        }

        try {
            this.logger.info('Connecting to Kurento Media Server', { url: this.config.kurentoUrl });
            this.emit(RecordingManagerEvent.CONNECTING);

            // Create Kurento connector if it doesn't exist
            if (!this.kurentoConnector) {
                const connectionOptions: KurentoConnectionOptions = {
                    kurentoUrl: this.config.kurentoUrl,
                    reconnect: true,
                    reconnectAttempts: this.config.reconnectAttempts,
                    reconnectInterval: this.config.reconnectInterval
                };

                this.kurentoConnector = new KurentoConnector(connectionOptions);
                this.setupConnectorEventForwarding();
            }

            // Connect to Kurento
            await this.kurentoConnector.connect();

            // If this is a reconnection, clear the disconnection timestamp
            if (this.disconnectionTimestamp !== null) {
                // Calculate reconnection time
                const reconnectionTime = Date.now() - this.disconnectionTimestamp;
                this.logger.info('Reconnected to Kurento Media Server', {
                    reconnectionTimeMs: reconnectionTime
                });

                // Clear any pipeline release timers
                this.clearPipelineReleaseTimers();

                // Reset disconnection timestamp
                this.disconnectionTimestamp = null;
            }

            // Make sure the temporary directory exists
            await this.ensureTempDirectory();

            this.isInitialized = true;
            this.emit(RecordingManagerEvent.CONNECTED);
            this.logger.info('Connected to Kurento Media Server');
        } catch (error: any) {
            this.emit(RecordingManagerEvent.CONNECTION_FAILED, error);
            this.logger.error('Failed to connect to Kurento Media Server', { error });
            throw new ConnectionError(
                `Failed to connect to Kurento Media Server: ${error.message}`,
                ErrorCode.CONNECTION_FAILED,
                error
            );
        }
    }

    /**
     * Disconnect from Kurento Media Server
     * @param releasePipelines Whether to forcibly release pipelines, ignoring preservePipelinesOnDisconnect setting (default: false)
     */
    async disconnect(releasePipelines: boolean = false): Promise<void> {
        // If we have active sessions and are configured to preserve pipelines
        if (this.sessions.size > 0 && this.config.preservePipelinesOnDisconnect && !releasePipelines) {
            this.logger.info(`Disconnecting with ${this.sessions.size} active sessions, preserving pipelines`);
            this.disconnectionTimestamp = Date.now();

            // Set up timers to release pipelines if reconnection doesn't happen in time
            if (this.config.maxReconnectionTimeMs > 0) {
                this.schedulePipelineRelease();
            }

            this.emit(RecordingManagerEvent.PIPELINE_PRESERVED, {
                sessionCount: this.sessions.size,
                maxReconnectionTimeMs: this.config.maxReconnectionTimeMs
            });
        } else {
            // Stop all active recording sessions
            if (this.sessions.size > 0) {
                this.logger.info(`Stopping ${this.sessions.size} active recording sessions`);
                await this.stopAllSessions();
            }
        }

        // Disconnect from Kurento
        if (this.kurentoConnector) {
            try {
                this.logger.info('Disconnecting from Kurento Media Server');
                await this.kurentoConnector.disconnect();
                this.isInitialized = false;
                this.emit(RecordingManagerEvent.DISCONNECTED);
                this.logger.info('Disconnected from Kurento Media Server');
            } catch (error: any) {
                this.logger.error('Error disconnecting from Kurento Media Server', { error });
                throw new ConnectionError(
                    `Error disconnecting from Kurento Media Server: ${error.message}`,
                    ErrorCode.DISCONNECT_FAILED,
                    error
                );
            }
        }
    }

    /**
     * Schedule automatic pipeline release if reconnection doesn't happen in time
     */
    private schedulePipelineRelease(): void {
        const sessionIds = this.getActiveSessionIds();

        sessionIds.forEach(sessionId => {
            // Clear any existing timer for this session
            if (this.pipelineReleaseTimers.has(sessionId)) {
                clearTimeout(this.pipelineReleaseTimers.get(sessionId)!);
            }

            // Set a new timer to release the pipeline after the configured timeout
            const timer = setTimeout(async () => {
                try {
                    this.logger.warn(`Reconnection timed out for session ${sessionId}, releasing pipeline`);

                    // Get the session and release its resources
                    const session = this.sessions.get(sessionId);
                    if (session) {
                        await session.release();
                        this.sessions.delete(sessionId);
                    }

                    // Remove the timer
                    this.pipelineReleaseTimers.delete(sessionId);

                    this.emit(RecordingManagerEvent.RECONNECTION_TIMED_OUT, {
                        sessionId,
                        timeoutMs: this.config.maxReconnectionTimeMs
                    });

                    this.emit(RecordingManagerEvent.PIPELINE_RELEASED, {
                        sessionId,
                        reason: 'reconnection-timeout'
                    });
                } catch (error) {
                    this.logger.error(`Error releasing pipeline for session ${sessionId}`, { error });
                }
            }, this.config.maxReconnectionTimeMs);

            this.pipelineReleaseTimers.set(sessionId, timer);

            this.logger.debug(`Scheduled pipeline release for session ${sessionId} in ${this.config.maxReconnectionTimeMs}ms`);
        });
    }

    /**
     * Clear all pipeline release timers
     */
    private clearPipelineReleaseTimers(): void {
        for (const [sessionId, timer] of this.pipelineReleaseTimers.entries()) {
            clearTimeout(timer);
            this.logger.debug(`Cleared pipeline release timer for session ${sessionId}`);
        }

        this.pipelineReleaseTimers.clear();
    }

    /**
     * Create a new recording session
     * 
     * @param options Recording session options
     * @returns New RecordingSession
     */
    async createSession(options: RecordingSessionOptions = {}): Promise<RecordingSession> {
        // Ensure connected to Kurento
        if (!this.isInitialized || !this.kurentoConnector || !this.kurentoConnector.isConnected()) {
            this.logger.info('Not connected to Kurento Media Server, connecting...');
            await this.connect();
        }

        // Validate and normalize options
        const sessionOptions = this.configManager.validateSessionOptions(options, this.config.tempDir);

        // Check if session ID already exists
        if (this.sessions.has(sessionOptions.sessionId)) {
            throw new SessionError(
                `Session with ID ${sessionOptions.sessionId} already exists`,
                ErrorCode.SESSION_ALREADY_EXISTS
            );
        }

        try {
            this.logger.info('Creating new recording session', {
                sessionId: sessionOptions.sessionId,
                mediaProfile: sessionOptions.mediaProfile,
                insertBlankScreenOnPause: sessionOptions.insertBlankScreenOnPause
            });

            // Get Kurento client
            const kurentoClient = this.kurentoConnector?.getClient();
            if (!kurentoClient) {
                throw new ConnectionError(
                    'Kurento client is not available',
                    ErrorCode.CONNECTION_FAILED
                );
            }

            // Create a new media pipeline
            const pipeline = new MediaPipeline(
                kurentoClient as any,
                this.logger.createChild({ name: `Pipeline:${sessionOptions.sessionId}` })
            );
            await pipeline.initialize();

            // Create a WebRTC handler
            const webrtcHandler = new WebRTCHandler(
                this.logger.createChild({ name: `WebRTC:${sessionOptions.sessionId}` })
            );

            // Create a new recording session
            const session = new RecordingSession(
                sessionOptions,
                pipeline,
                this.logger.createChild({ name: `Session:${sessionOptions.sessionId}` })
            );

            // Initialize the session
            await session.initialize();

            // Store the session
            this.sessions.set(sessionOptions.sessionId, session);

            // Set up event forwarding
            this.setupSessionEventForwarding(session);

            this.emit(RecordingManagerEvent.SESSION_CREATED, {
                sessionId: sessionOptions.sessionId,
                options: sessionOptions
            });

            this.logger.info('Recording session created', { sessionId: sessionOptions.sessionId });
            return session;
        } catch (error: any) {
            this.logger.error('Error creating recording session', { error, sessionId: sessionOptions.sessionId });
            throw new SessionError(
                `Error creating recording session: ${error.message}`,
                ErrorCode.SESSION_CREATION_FAILED,
                error
            );
        }
    }

    /**
     * Get a recording session by ID
     * 
     * @param sessionId Session ID
     * @returns RecordingSession or null if not found
     */
    getSession(sessionId: string): RecordingSession | null {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Stop a recording session by ID
     * 
     * @param sessionId Session ID
     * @returns RecordingResult
     */
    async stopSession(sessionId: string): Promise<RecordingResult> {
        const session = this.sessions.get(sessionId);

        if (!session) {
            throw new SessionError(
                `Session with ID ${sessionId} not found`,
                ErrorCode.SESSION_NOT_FOUND
            );
        }

        try {
            this.logger.info('Stopping recording session', { sessionId });

            // Clear pipeline release timer if exists
            if (this.pipelineReleaseTimers.has(sessionId)) {
                clearTimeout(this.pipelineReleaseTimers.get(sessionId)!);
                this.pipelineReleaseTimers.delete(sessionId);
            }

            // Stop the recording
            const result = await session.stop();

            // Remove the session
            this.sessions.delete(sessionId);

            this.emit(RecordingManagerEvent.SESSION_ENDED, {
                sessionId,
                result
            });

            this.logger.info('Recording session stopped', { sessionId, filePath: result.path });
            return result;
        } catch (error: any) {
            this.logger.error('Error stopping recording session', { error, sessionId });
            throw new SessionError(
                `Error stopping recording session: ${error.message}`,
                ErrorCode.RECORDING_STOP_ERROR,
                error
            );
        }
    }

    /**
     * Stop all active recording sessions
     */
    async stopAllSessions(): Promise<void> {
        const sessionIds = [...this.sessions.keys()];
        this.logger.info(`Stopping all recording sessions (${sessionIds.length})`);

        // Clear all pipeline release timers
        this.clearPipelineReleaseTimers();

        const stopPromises = sessionIds.map(async (sessionId) => {
            try {
                await this.stopSession(sessionId);
            } catch (error: any) {
                this.logger.error(`Error stopping session ${sessionId}`, { error });
                // Continue with other sessions even if one fails
            }
        });

        await Promise.all(stopPromises);
        this.logger.info('All recording sessions stopped');
    }

    /**
     * Get the number of active recording sessions
     * 
     * @returns Number of active sessions
     */
    getActiveSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Get the IDs of all active recording sessions
     * 
     * @returns Array of session IDs
     */
    getActiveSessionIds(): string[] {
        return [...this.sessions.keys()];
    }

    /**
     * Check if connected to Kurento Media Server
     * 
     * @returns true if connected
     */
    isConnected(): boolean {
        return !!(this.kurentoConnector && this.kurentoConnector.isConnected());
    }

    /**
     * Set up event forwarding from the Kurento connector
     */
    private setupConnectorEventForwarding(): void {
        if (!this.kurentoConnector) return;

        // Forward connection events
        this.kurentoConnector.on('connected', () => {
            this.emit(RecordingManagerEvent.CONNECTED);
        });

        this.kurentoConnector.on('disconnected', () => {
            // Set disconnection timestamp if we're preserving pipelines
            if (this.config.preservePipelinesOnDisconnect && this.sessions.size > 0) {
                this.disconnectionTimestamp = Date.now();
                this.schedulePipelineRelease();
            }

            this.emit(RecordingManagerEvent.DISCONNECTED);
        });

        this.kurentoConnector.on('reconnecting', () => {
            this.emit(RecordingManagerEvent.RECONNECTING);
        });

        this.kurentoConnector.on('reconnect_failed', (error) => {
            this.emit(RecordingManagerEvent.CONNECTION_FAILED, error);
        });

        this.kurentoConnector.on('error', (error) => {
            this.emit(RecordingManagerEvent.ERROR, error);
        });
    }

    /**
     * Set up event forwarding from recording sessions
     * 
     * @param session RecordingSession
     */
    private setupSessionEventForwarding(session: RecordingSession): void {
        // Forward session events with the session ID
        session.on('error', (error) => {
            this.emit(RecordingManagerEvent.ERROR, {
                sessionId: session.getSessionId(),
                error
            });
        });
    }

    /**
     * Ensure the temporary directory exists
     */
    private async ensureTempDirectory(): Promise<void> {
        try {
            const dirExists = await exists(this.config.tempDir);

            if (!dirExists) {
                this.logger.debug(`Creating temporary directory: ${this.config.tempDir}`);
                await mkdir(this.config.tempDir, { recursive: true });
            }
        } catch (error: any) {
            this.logger.error('Error ensuring temporary directory exists', { error, dir: this.config.tempDir });
            throw new Error(`Failed to create temporary directory: ${error.message}`);
        }
    }
} 