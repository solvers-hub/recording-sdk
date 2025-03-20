/**
 * RecordingSession: Manages a single recording session
 */

import * as fs from 'fs';
import { promisify } from 'util';
import { TypedEventEmitter } from '../events';
import { Logger } from '../utils';
import { SessionError, MediaError, WebRTCError } from '../errors';
import { ErrorCode } from '../constants';
import {
    RecordingSessionOptions,
    RecordingState,
    RecordingResult,
    SdpData,
    IceCandidate,
    NetworkQualityEvent,
    QualityChangedEvent,
    RecordingMode,
    PauseType
} from '../types';
import { MediaPipeline } from './MediaPipeline';
import { WebRTCHandler } from './WebRTCHandler';
import { EndpointManager, EndpointCreationOptions } from './EndpointManager';

const stat = promisify(fs.stat);

/**
 * Events emitted by RecordingSession
 */
export interface RecordingSessionEvents {
    'state-change': RecordingState;
    'recording-started': { timestamp: number };
    'recording-stopped': RecordingResult;
    'quality-changed': QualityChangedEvent;
    'network-quality': NetworkQualityEvent;
    'ice-candidate': IceCandidate;
    'paused': { timestamp: number, pauseType: PauseType };
    'resumed': { timestamp: number, pauseDurationMs: number, resumeType?: PauseType };
    'error': Error;
}

/**
 * Manages a single recording session
 */
export class RecordingSession extends TypedEventEmitter<RecordingSessionEvents> {
    private logger: Logger;
    private options: Required<RecordingSessionOptions>;
    private pipeline: MediaPipeline;
    private webrtcHandler: WebRTCHandler;
    private endpointManager: EndpointManager | null = null;
    private state: RecordingState = RecordingState.CREATED;
    private startTime: number = 0;
    private stopTime: number = 0;
    private pauseStartTime: number = 0;
    private totalPausedTime: number = 0;
    private blankScreenElement: any = null;
    private pauseType: PauseType = PauseType.BOTH;
    private isAudioPaused: boolean = false;
    private isVideoPaused: boolean = false;

    /**
     * Create a new RecordingSession
     * 
     * @param sessionId Unique session ID
     * @param options Session configuration options
     * @param pipeline Media pipeline
     * @param logger Logger instance
     */
    constructor(
        options: Required<RecordingSessionOptions>,
        pipeline: MediaPipeline,
        logger: Logger
    ) {
        super();

        this.options = options;
        this.pipeline = pipeline;
        this.logger = logger.createChild({
            name: 'RecordingSession',
            context: { sessionId: options.sessionId }
        });

        this.webrtcHandler = new WebRTCHandler(this.logger);
        this.logger.info('Recording session created', {
            sessionId: options.sessionId,
            recordingMode: options.recordingMode,
            mediaProfile: options.mediaProfile,
            insertBlankScreenOnPause: options.insertBlankScreenOnPause
        });
    }

    /**
     * Initialize the recording session
     */
    async initialize(): Promise<void> {
        try {
            this.logger.debug('Initializing recording session');

            // Create endpoint manager
            this.endpointManager = new EndpointManager(this.pipeline, this.logger);

            // Created initialized state
            this.setState(RecordingState.READY);
            this.logger.info('Recording session initialized and ready');
        } catch (error: any) {
            this.logger.error('Failed to initialize recording session', { error });
            this.setState(RecordingState.ERROR);
            throw new SessionError(
                `Failed to initialize recording session: ${error.message}`,
                ErrorCode.SESSION_CREATION_FAILED,
                error
            );
        }
    }

    /**
     * Process WebRTC offer and create endpoints
     * 
     * @param sdpOffer SDP offer
     * @returns SDP answer
     */
    async processOffer(sdpOffer: string | SdpData): Promise<SdpData> {
        if (this.state !== RecordingState.READY) {
            throw new SessionError(
                `Cannot process offer in state ${this.state}`,
                ErrorCode.SESSION_INVALID_STATE
            );
        }

        try {
            this.logger.debug('Creating endpoints for session');

            // Create endpoints
            const endpointOptions: EndpointCreationOptions = {
                recordingMode: this.options.recordingMode,
                mediaProfile: this.options.mediaProfile,
                filePath: this.options.filePath,
                hasAudio: this.options.hasAudio,
                webRtcOptions: {
                    useIpv6: false
                }
            };

            if (!this.endpointManager) {
                throw new SessionError(
                    'Endpoint manager not initialized',
                    ErrorCode.SESSION_NOT_READY
                );
            }

            const endpoints = await this.endpointManager.createEndpoints(endpointOptions);
            this.webrtcHandler.setEndpoint(endpoints.webRtcEndpoint);

            // Process the offer
            this.logger.debug('Processing SDP offer');
            const sdpAnswer = await this.webrtcHandler.processOffer(sdpOffer);

            // Gather ICE candidates
            await this.webrtcHandler.gatherCandidates();

            // Set quality parameters
            await this.webrtcHandler.setQualityParameters(
                this.options.minBitrate,
                this.options.maxBitrate
            );

            this.logger.info('Successfully processed WebRTC offer');
            return sdpAnswer;
        } catch (error: any) {
            this.logger.error('Error processing offer', { error });
            this.setState(RecordingState.ERROR);

            if (error instanceof WebRTCError) {
                throw error;
            } else {
                throw new SessionError(
                    `Failed to process offer: ${error.message}`,
                    ErrorCode.SESSION_NOT_READY,
                    error
                );
            }
        }
    }

    /**
     * Add an ICE candidate
     * 
     * @param candidate ICE candidate
     */
    async addIceCandidate(candidate: IceCandidate): Promise<void> {
        try {
            await this.webrtcHandler.addIceCandidate(candidate);
        } catch (error: any) {
            this.logger.error('Error adding ICE candidate', { error, candidate });
            // Don't throw here - ICE candidates can fail individually without failing the session
        }
    }

    /**
     * Start recording
     */
    async start(): Promise<void> {
        if (this.state !== RecordingState.READY) {
            throw new SessionError(
                `Cannot start recording in state ${this.state}`,
                ErrorCode.SESSION_INVALID_STATE
            );
        }

        if (!this.endpointManager) {
            throw new SessionError(
                'Endpoint manager not initialized',
                ErrorCode.SESSION_NOT_READY
            );
        }

        if (!this.webrtcHandler.hasEndpoint()) {
            throw new SessionError(
                'WebRTC endpoint not created, process an offer first',
                ErrorCode.SESSION_NOT_READY
            );
        }

        try {
            this.logger.info('Starting recording');
            await this.endpointManager.startRecording();
            this.startTime = Date.now();
            this.setState(RecordingState.RECORDING);
            this.emit('recording-started', { timestamp: this.startTime });
            this.logger.info('Recording started successfully');
        } catch (error: any) {
            this.logger.error('Error starting recording', { error });
            this.setState(RecordingState.ERROR);

            if (error instanceof MediaError) {
                throw error;
            } else {
                throw new SessionError(
                    `Failed to start recording: ${error.message}`,
                    ErrorCode.SESSION_INVALID_STATE,
                    error
                );
            }
        }
    }

    /**
     * Stop recording
     * 
     * @returns Recording result
     */
    async stop(): Promise<RecordingResult> {
        if (this.state !== RecordingState.RECORDING && this.state !== RecordingState.PAUSED) {
            this.logger.warn(`Trying to stop recording in state ${this.state}`);

            // If we're in an error state, we might still want to try to stop and clean up
            if (this.state !== RecordingState.ERROR) {
                throw new SessionError(
                    `Cannot stop recording in state ${this.state}`,
                    ErrorCode.SESSION_INVALID_STATE
                );
            }
        }

        try {
            this.logger.info('Stopping recording');

            // If we're paused and have a blank screen, remove it first
            if (this.state === RecordingState.PAUSED && this.blankScreenElement) {
                await this.removePauseBlankScreen();
            }

            // Stop recording
            if (this.endpointManager) {
                await this.endpointManager.stopRecording();
            }

            this.stopTime = Date.now();
            this.setState(RecordingState.STOPPED);

            // Create the recording result
            const result = await this.createRecordingResult();
            this.emit('recording-stopped', result);

            this.logger.info('Recording stopped successfully', {
                filePath: result.path,
                duration: result.duration
            });

            return result;
        } catch (error: any) {
            this.logger.error('Error stopping recording', { error });
            this.setState(RecordingState.ERROR);
            throw new SessionError(
                `Failed to stop recording: ${error.message}`,
                ErrorCode.RECORDING_STOP_ERROR,
                error
            );
        }
    }

    /**
     * Pause recording
     * 
     * @param pauseType Type of pause (both, audio-only, video-only)
     */
    async pause(pauseType: PauseType = PauseType.BOTH): Promise<void> {
        if (this.state !== RecordingState.RECORDING) {
            throw new SessionError(
                `Cannot pause recording in state ${this.state}`,
                ErrorCode.SESSION_INVALID_STATE
            );
        }

        try {
            this.logger.info('Pausing recording', { pauseType });
            this.pauseStartTime = Date.now();
            this.pauseType = pauseType;

            // Track which streams are paused
            if (pauseType === PauseType.BOTH || pauseType === PauseType.AUDIO_ONLY) {
                this.isAudioPaused = true;
            }

            if (pauseType === PauseType.BOTH || pauseType === PauseType.VIDEO_ONLY) {
                this.isVideoPaused = true;
                // Insert blank screen if video is paused and option is enabled
                if (this.options.insertBlankScreenOnPause && !this.blankScreenElement) {
                    await this.insertPauseBlankScreen();
                }
            }

            this.setState(RecordingState.PAUSED);
            this.emit('paused', {
                timestamp: this.pauseStartTime,
                pauseType: this.pauseType
            });
            this.logger.info('Recording paused', { pauseType });
        } catch (error: any) {
            this.logger.error('Error pausing recording', { error });
            throw new SessionError(
                `Failed to pause recording: ${error.message}`,
                ErrorCode.SESSION_INVALID_STATE,
                error
            );
        }
    }

    /**
     * Resume recording
     * 
     * @param resumeType Type of stream to resume (defaults to whatever was paused)
     */
    async resume(resumeType?: PauseType): Promise<void> {
        if (this.state !== RecordingState.PAUSED) {
            throw new SessionError(
                `Cannot resume recording in state ${this.state}`,
                ErrorCode.SESSION_INVALID_STATE
            );
        }

        try {
            // If resumeType not specified, resume what was paused
            const actualResumeType = resumeType || this.pauseType;
            this.logger.info('Resuming recording', { resumeType: actualResumeType });

            // Calculate pause duration
            const currentTime = Date.now();
            const pauseDuration = currentTime - this.pauseStartTime;
            this.totalPausedTime += pauseDuration;

            // Track which streams are resumed
            if (actualResumeType === PauseType.BOTH ||
                (actualResumeType === PauseType.AUDIO_ONLY && this.isAudioPaused) ||
                (actualResumeType === PauseType.VIDEO_ONLY && this.isVideoPaused)) {

                if (actualResumeType === PauseType.BOTH || actualResumeType === PauseType.AUDIO_ONLY) {
                    this.isAudioPaused = false;
                }

                if (actualResumeType === PauseType.BOTH || actualResumeType === PauseType.VIDEO_ONLY) {
                    this.isVideoPaused = false;
                }

                // Remove blank screen if video is being resumed and there's a blank screen
                if ((actualResumeType === PauseType.BOTH || actualResumeType === PauseType.VIDEO_ONLY)
                    && this.blankScreenElement) {
                    await this.removePauseBlankScreen();
                }
            }

            // If both audio and video are resumed, set state back to RECORDING
            if (!this.isAudioPaused && !this.isVideoPaused) {
                this.setState(RecordingState.RECORDING);
            }

            this.emit('resumed', {
                timestamp: currentTime,
                pauseDurationMs: pauseDuration,
                resumeType: actualResumeType
            });

            this.logger.info('Recording resumed', {
                pauseDurationMs: pauseDuration,
                isAudioPaused: this.isAudioPaused,
                isVideoPaused: this.isVideoPaused
            });
        } catch (error: any) {
            this.logger.error('Error resuming recording', { error });
            throw new SessionError(
                `Failed to resume recording: ${error.message}`,
                ErrorCode.SESSION_INVALID_STATE,
                error
            );
        }
    }

    /**
     * Insert blank screen for paused state
     */
    private async insertPauseBlankScreen(): Promise<void> {
        if (!this.endpointManager || !this.options.insertBlankScreenOnPause) {
            return;
        }

        try {
            this.logger.debug('Inserting blank screen during pause');

            // Create a blank video element with the specified color
            const color = this.options.blankScreenColor || 'black';
            this.blankScreenElement = await this.pipeline.createBlankVideoElement(color);

            // Connect the blank screen element to the recording
            if (this.blankScreenElement && this.endpointManager) {
                await this.endpointManager.connectBlankScreen(this.blankScreenElement);
                this.logger.debug('Blank screen inserted successfully', { color });
            }
        } catch (error: any) {
            this.logger.error('Error inserting blank screen', { error });
            // Don't throw - treat blank screen as non-critical
        }
    }

    /**
     * Remove blank screen after resuming
     */
    private async removePauseBlankScreen(): Promise<void> {
        if (!this.blankScreenElement) {
            return;
        }

        try {
            this.logger.debug('Removing blank screen');
            // Disconnect the blank screen element from the recording
            if (this.endpointManager) {
                await this.endpointManager.disconnectBlankScreen();
            }

            // Release the blank screen element
            await this.blankScreenElement.release();
            this.blankScreenElement = null;
            this.logger.debug('Blank screen removed');
        } catch (error: any) {
            this.logger.error('Error removing blank screen', { error });
            // Don't throw - treat blank screen as non-critical
        }
    }

    /**
     * Update quality parameters
     * 
     * @param params Quality parameters
     */
    async setQuality(params: { minBitrate?: number; maxBitrate?: number; frameRate?: number }): Promise<void> {
        if (this.state !== RecordingState.RECORDING && this.state !== RecordingState.PAUSED) {
            throw new SessionError(
                `Cannot update quality in state ${this.state}`,
                ErrorCode.SESSION_INVALID_STATE
            );
        }

        try {
            this.logger.info('Updating quality parameters', params);

            // Update WebRTC parameters if changed
            if (params.minBitrate !== undefined || params.maxBitrate !== undefined) {
                const minBitrate = params.minBitrate ?? this.options.minBitrate;
                const maxBitrate = params.maxBitrate ?? this.options.maxBitrate;

                await this.webrtcHandler.setQualityParameters(minBitrate, maxBitrate);
                this.options.minBitrate = minBitrate;
                this.options.maxBitrate = maxBitrate;
            }

            // Update frame rate if changed
            if (params.frameRate !== undefined) {
                // WebRTCHandler doesn't have setFrameRate method, use existing quality parameters instead
                const minBitrate = this.options.minBitrate;
                const maxBitrate = this.options.maxBitrate;

                // Update frameRate in options first so it's available for the next quality parameter update
                this.options.frameRate = params.frameRate;
            }

            // Emit quality changed event with all required properties
            const qualityEvent: QualityChangedEvent = {
                minBitrate: this.options.minBitrate,
                maxBitrate: this.options.maxBitrate,
                frameRate: this.options.frameRate,
                reason: 'user',
                timestamp: Date.now()
            };

            this.emit('quality-changed', qualityEvent);

            this.logger.info('Quality parameters updated');
        } catch (error: any) {
            this.logger.error('Error updating quality parameters', { error, params });
            throw new SessionError(
                `Failed to update quality parameters: ${error.message}`,
                ErrorCode.INVALID_PARAMETER,
                error
            );
        }
    }

    /**
     * Get the current recording state
     * 
     * @returns Recording state
     */
    getState(): RecordingState {
        return this.state;
    }

    /**
     * Get the recording session options
     * 
     * @returns Session options
     */
    getOptions(): Required<RecordingSessionOptions> {
        return { ...this.options };
    }

    /**
     * Get the session ID
     * 
     * @returns Session ID
     */
    getSessionId(): string {
        return this.options.sessionId;
    }

    /**
     * Get the output file path
     * 
     * @returns File path
     */
    getFilePath(): string {
        return this.options.filePath;
    }

    /**
     * Release all resources used by this session
     */
    async release(): Promise<void> {
        try {
            this.logger.debug('Releasing session resources');

            // Release blank screen if it exists
            if (this.blankScreenElement) {
                try {
                    await this.blankScreenElement.release();
                    this.blankScreenElement = null;
                } catch (error) {
                    this.logger.warn('Error releasing blank screen element', { error });
                }
            }

            // Release endpoints
            if (this.endpointManager) {
                await this.endpointManager.releaseEndpoints();
            }

            // Release pipeline
            await this.pipeline.release();

            this.logger.info('Session resources released');
        } catch (error: any) {
            this.logger.error('Error releasing session resources', { error });
            throw new SessionError(
                `Failed to release session resources: ${error.message}`,
                ErrorCode.RESOURCE_RELEASE_ERROR,
                error
            );
        }
    }

    /**
     * Update the session state
     * 
     * @param state New state
     */
    private setState(state: RecordingState): void {
        this.logger.debug(`State change: ${this.state} -> ${state}`);
        this.state = state;
        this.emit('state-change', state);
    }

    /**
     * Create the recording result
     * 
     * @returns RecordingResult
     */
    private async createRecordingResult(): Promise<RecordingResult> {
        const filePath = this.options.filePath;

        // Calculate duration based on start and stop times, accounting for paused time
        let duration = 0;
        if (this.startTime > 0 && this.stopTime > 0) {
            // Calculate total elapsed time in seconds
            const totalElapsedMs = this.stopTime - this.startTime;

            // Check if the insertBlankScreenOnPause false then decrease the duration do not
            if (!this.options.insertBlankScreenOnPause) {
                duration = Math.round((totalElapsedMs - this.totalPausedTime) / 1000);
            } else {
                duration = Math.round(totalElapsedMs / 1000);
            }

            this.logger.debug('Recording duration calculation', {
                startTime: this.startTime,
                stopTime: this.stopTime,
                elapsedMs: totalElapsedMs,
                pausedMs: this.totalPausedTime,
                durationSec: duration
            });
        }

        return {
            path: filePath,
            duration,
            mediaProfile: this.options.mediaProfile,
            sessionId: this.options.sessionId,
            timestamp: {
                start: this.startTime,
                end: this.stopTime
            }
        };
    }
} 