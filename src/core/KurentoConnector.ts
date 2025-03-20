/**
 * KurentoConnector - Handles connection to Kurento Media Server
 */

import * as kurento from 'kurento-client';
import { EventEmitter } from '../events';
import { ConfigManager } from '../utils/ConfigManager';
import { Logger } from '../utils/Logger';
import { KurentoConnectionOptions } from '../types/KurentoTypes';
import { ConnectionError } from '../errors/ConnectionError';
import { ErrorCode } from '../constants/ErrorCodes';

/**
 * Events emitted by KurentoConnector
 */
export enum KurentoConnectorEvent {
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    RECONNECTING = 'reconnecting',
    RECONNECTED = 'reconnected',
    RECONNECTION_FAILED = 'reconnect_failed',
    ERROR = 'error'
}

/**
 * Class responsible for managing the connection to Kurento Media Server
 */
export class KurentoConnector extends EventEmitter {
    private client: kurento.ClientInstance | null = null;
    private options: KurentoConnectionOptions;
    private isConnecting = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private logger: Logger;
    private configManager: ConfigManager;

    /**
     * Create a new KurentoConnector
     * @param options Connection options
     */
    constructor(options: KurentoConnectionOptions) {
        super();

        this.options = options;
        this.configManager = ConfigManager.getInstance();
        this.logger = new Logger({
            name: 'KurentoConnector'
        });

        this.logger.debug('Initialized KurentoConnector', { kurentoUrl: this.options.kurentoUrl });
    }

    /**
     * Get the Kurento client instance
     * @returns The Kurento client
     */
    public getClient(): kurento.ClientInstance | null {
        return this.client;
    }

    /**
     * Check if connected to Kurento Media Server
     * @returns True if connected, false otherwise
     */
    public isConnected(): boolean {
        return this.client !== null;
    }

    /**
     * Connect to Kurento Media Server
     * @returns Promise that resolves when connected
     */
    public async connect(): Promise<kurento.ClientInstance> {
        if (this.client) {
            this.logger.debug('Already connected to Kurento Media Server');
            return this.client;
        }

        if (this.isConnecting) {
            this.logger.debug('Connection to Kurento Media Server is in progress');
            throw new ConnectionError(
                'Connection to Kurento Media Server is already in progress',
                ErrorCode.CONNECTION_IN_PROGRESS
            );
        }

        this.isConnecting = true;

        try {
            this.logger.info('Connecting to Kurento Media Server', { url: this.options.kurentoUrl });
            this.client = await kurento.getSingleton(this.options.kurentoUrl, this.options.kurentoOptions);
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            this.logger.info('Connected to Kurento Media Server');
            this.emit('connected');

            return this.client;
        } catch (error) {
            this.isConnecting = false;
            this.client = null;

            this.logger.error('Failed to connect to Kurento Media Server', { error });

            // Try to reconnect if enabled
            if (this.options.reconnect && this.reconnectAttempts < this.options.reconnectAttempts!) {
                this.scheduleReconnect();
            }

            throw new ConnectionError(
                `Failed to connect to Kurento Media Server: ${(error as Error).message}`,
                ErrorCode.CONNECTION_FAILED,
                error
            );
        }
    }

    /**
     * Disconnect from Kurento Media Server
     */
    public async disconnect(): Promise<void> {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (!this.client) {
            this.logger.debug('Not connected to Kurento Media Server');
            return;
        }

        try {
            this.logger.info('Disconnecting from Kurento Media Server');
            // Close the connection
            await this.client.close();
            this.client = null;
            this.emit('disconnected');
            this.logger.info('Disconnected from Kurento Media Server');
        } catch (error) {
            this.logger.error('Error disconnecting from Kurento Media Server', { error });
            // Force disconnect
            this.client = null;
            this.emit('disconnected');

            throw new ConnectionError(
                `Error disconnecting from Kurento Media Server: ${(error as Error).message}`,
                ErrorCode.DISCONNECT_FAILED,
                error
            );
        }
    }

    /**
     * Schedule a reconnection attempt
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectAttempts++;
        const delay = this.calculateReconnectDelay();

        this.logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            this.logger.info(`Reconnection attempt ${this.reconnectAttempts}`);

            try {
                await this.connect();
                this.logger.info('Reconnected to Kurento Media Server');
                this.emit('reconnected');
            } catch (error) {
                this.logger.error('Reconnection failed', { error, attempt: this.reconnectAttempts });
                this.emit('reconnect_failed', error);

                // Schedule next reconnection attempt if we haven't reached the limit
                if (this.reconnectAttempts < this.options.reconnectAttempts!) {
                    this.scheduleReconnect();
                } else {
                    this.logger.error('Max reconnection attempts reached');
                    this.emit('reconnect_max_attempts', this.options.reconnectAttempts);
                }
            }
        }, delay);
    }

    /**
     * Calculate the reconnection delay using exponential backoff
     * @returns Delay in milliseconds
     */
    private calculateReconnectDelay(): number {
        const baseDelay = this.options.reconnectBaseDelay || this.configManager.get('connection.reconnectBaseDelay');
        const maxDelay = this.options.reconnectMaxDelay || this.configManager.get('connection.reconnectMaxDelay');

        // Calculate delay with jitter
        const exponentialBackoff = Math.min(
            maxDelay,
            baseDelay * Math.pow(2, this.reconnectAttempts - 1)
        );

        // Add some randomness to prevent all clients from reconnecting at the same time
        const jitter = Math.random() * 0.5 + 0.5; // between 0.5 and 1
        return Math.floor(exponentialBackoff * jitter);
    }
}
