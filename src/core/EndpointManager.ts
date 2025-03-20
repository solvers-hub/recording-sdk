/**
 * EndpointManager: Manages WebRTC and Recorder endpoints
 */

import * as path from 'path';
import { Logger } from '../utils';
import { MediaError } from '../errors';
import { ErrorCode } from '../constants';
import {
    WebRtcEndpointOptions,
    RecorderEndpointOptions,
    MediaProfile,
    RecordingMode,
    WebRtcEndpoint,
    RecorderEndpoint
} from '../types';
import { MediaPipeline } from './MediaPipeline';
import { DEFAULT_WEBRTC_OPTIONS, DEFAULT_RECORDER_OPTIONS } from '../constants';

/**
 * Options for creating endpoints
 */
export interface EndpointCreationOptions {
    /** Recording mode (audio+video, audio-only, video-only) */
    recordingMode: RecordingMode;
    /** Media profile for recording */
    mediaProfile: MediaProfile;
    /** Target file path for recording */
    filePath: string;
    /** Whether audio is expected */
    hasAudio: boolean;
    /** WebRTC endpoint options */
    webRtcOptions?: WebRtcEndpointOptions;
    /** Recorder endpoint options */
    recorderOptions?: Partial<RecorderEndpointOptions>;
}

/**
 * Manages WebRTC and Recorder endpoints
 */
export class EndpointManager {
    private logger: Logger;
    private pipeline: MediaPipeline;
    private webRtcEndpoint: WebRtcEndpoint | null = null;
    private recorderEndpoint: RecorderEndpoint | null = null;
    private recordingMode: RecordingMode | null = null;
    private isRecording: boolean = false;
    private blankScreenElement: any = null;

    /**
     * Create a new EndpointManager
     * 
     * @param pipeline Media pipeline
     * @param logger Logger instance
     */
    constructor(pipeline: MediaPipeline, logger: Logger) {
        this.pipeline = pipeline;
        this.logger = logger.createChild({ name: 'EndpointManager' });
    }

    /**
     * Create WebRTC and Recorder endpoints
     * 
     * @param options Endpoint creation options
     * @returns Object with created endpoints
     */
    async createEndpoints(options: EndpointCreationOptions): Promise<{
        webRtcEndpoint: WebRtcEndpoint;
        recorderEndpoint: RecorderEndpoint;
    }> {
        this.logger.debug('Creating endpoints', options);
        this.recordingMode = options.recordingMode;

        try {
            // Create WebRTC endpoint
            const webRtcOptions = this.prepareWebRtcOptions(options);
            this.webRtcEndpoint = await this.pipeline.createWebRtcEndpoint(webRtcOptions, 'webrtc');
            this.logger.debug('WebRTC endpoint created');

            // Create Recorder endpoint
            const recorderOptions = this.prepareRecorderOptions(options);
            this.recorderEndpoint = await this.pipeline.createRecorderEndpoint(recorderOptions, 'recorder');
            this.logger.debug('Recorder endpoint created');

            // Connect WebRTC to Recorder based on recording mode
            await this.connectEndpoints(options.recordingMode);

            return {
                webRtcEndpoint: this.webRtcEndpoint,
                recorderEndpoint: this.recorderEndpoint
            };
        } catch (error: any) {
            this.logger.error('Error creating endpoints', { error });
            throw new MediaError(
                `Failed to create endpoints: ${error.message}`,
                ErrorCode.ENDPOINT_CREATION_FAILED,
                error
            );
        }
    }

    /**
     * Start recording
     */
    async startRecording(): Promise<void> {
        if (!this.recorderEndpoint) {
            throw new MediaError(
                'Recorder endpoint not created',
                ErrorCode.RECORDING_START_ERROR
            );
        }

        if (this.isRecording) {
            this.logger.warn('Recording already started');
            return;
        }

        try {
            this.logger.info('Starting recording');
            await this.recorderEndpoint.record();
            this.isRecording = true;
            this.logger.info('Recording started successfully');
        } catch (error: any) {
            this.logger.error('Error starting recording', { error });
            throw new MediaError(
                `Failed to start recording: ${error.message}`,
                ErrorCode.RECORDING_START_ERROR,
                error
            );
        }
    }

    /**
     * Stop recording
     */
    async stopRecording(): Promise<void> {
        if (!this.recorderEndpoint) {
            throw new MediaError(
                'Recorder endpoint not created',
                ErrorCode.RECORDING_STOP_ERROR
            );
        }

        if (!this.isRecording) {
            this.logger.warn('Recording not started, nothing to stop');
            return;
        }

        try {
            this.logger.info('Stopping recording');
            await this.recorderEndpoint.stop();
            this.isRecording = false;
            this.logger.info('Recording stopped successfully');
        } catch (error: any) {
            this.logger.error('Error stopping recording', { error });
            throw new MediaError(
                `Failed to stop recording: ${error.message}`,
                ErrorCode.RECORDING_STOP_ERROR,
                error
            );
        }
    }

    /**
     * Get recording state
     * 
     * @returns Promise resolving to current recording state
     */
    async getRecordingState(): Promise<string> {
        if (!this.recorderEndpoint) {
            return 'NOT_CREATED';
        }

        try {
            return await this.recorderEndpoint.getState();
        } catch (error: any) {
            this.logger.warn('Error getting recorder state', { error });
            return 'UNKNOWN';
        }
    }

    /**
     * Release all endpoints
     */
    async releaseEndpoints(): Promise<void> {
        try {
            // Stop recording if active
            if (this.isRecording && this.recorderEndpoint) {
                try {
                    await this.recorderEndpoint.stop();
                    this.isRecording = false;
                } catch (error: any) {
                    this.logger.warn('Error stopping recording during release', { error });
                }
            }

            // Release recorder endpoint
            if (this.recorderEndpoint) {
                try {
                    await this.recorderEndpoint.release();
                    this.recorderEndpoint = null;
                } catch (error: any) {
                    this.logger.warn('Error releasing recorder endpoint', { error });
                }
            }

            // Release WebRTC endpoint
            if (this.webRtcEndpoint) {
                try {
                    await this.webRtcEndpoint.release();
                    this.webRtcEndpoint = null;
                } catch (error: any) {
                    this.logger.warn('Error releasing WebRTC endpoint', { error });
                }
            }

            this.logger.info('All endpoints released');
        } catch (error: any) {
            this.logger.error('Error releasing endpoints', { error });
            throw new MediaError(
                `Error releasing endpoints: ${error.message}`,
                ErrorCode.ENDPOINT_RELEASE_ERROR,
                error
            );
        }
    }

    /**
     * Connect WebRTC endpoint to Recorder endpoint based on recording mode
     * 
     * @param recordingMode Recording mode
     */
    private async connectEndpoints(recordingMode: RecordingMode): Promise<void> {
        if (!this.webRtcEndpoint || !this.recorderEndpoint) {
            throw new MediaError(
                'Endpoints not created, cannot connect',
                ErrorCode.ENDPOINT_CREATION_FAILED
            );
        }

        this.logger.debug(`Connecting endpoints for ${recordingMode} mode`);

        try {
            switch (recordingMode) {
                case RecordingMode.AUDIO_VIDEO:
                    // Connect both audio and video
                    await this.pipeline.connect(this.webRtcEndpoint, this.recorderEndpoint);
                    this.logger.debug('Connected WebRTC to Recorder for audio+video');
                    break;

                case RecordingMode.AUDIO_ONLY:
                    // Connect only audio
                    await this.pipeline.connect(this.webRtcEndpoint, this.recorderEndpoint, 'AUDIO');
                    this.logger.debug('Connected WebRTC to Recorder for audio-only');
                    break;

                case RecordingMode.VIDEO_ONLY:
                    // Connect only video
                    await this.pipeline.connect(this.webRtcEndpoint, this.recorderEndpoint, 'VIDEO');
                    this.logger.debug('Connected WebRTC to Recorder for video-only');
                    break;

                default:
                    this.logger.warn(`Unknown recording mode: ${recordingMode}`);
                    // Fall back to connecting both
                    await this.pipeline.connect(this.webRtcEndpoint, this.recorderEndpoint);
            }
        } catch (error: any) {
            this.logger.error('Error connecting endpoints', { error });
            throw new MediaError(
                `Failed to connect endpoints: ${error.message}`,
                ErrorCode.MEDIA_PIPELINE_ERROR,
                error
            );
        }
    }

    /**
     * Prepare WebRTC endpoint options based on recording mode
     * 
     * @param options Endpoint creation options
     * @returns WebRTC endpoint options
     */
    private prepareWebRtcOptions(options: EndpointCreationOptions): WebRtcEndpointOptions {
        const webRtcOptions: WebRtcEndpointOptions = {
            ...DEFAULT_WEBRTC_OPTIONS,
            ...options.webRtcOptions
        };

        // Configure media constraints based on recording mode
        if (options.recordingMode === RecordingMode.AUDIO_ONLY) {
            webRtcOptions.mediaConstraints = {
                audio: true,
                video: false
            };
        } else if (options.recordingMode === RecordingMode.VIDEO_ONLY) {
            webRtcOptions.mediaConstraints = {
                audio: false,
                video: true
            };
        } else {
            // Audio+Video mode
            webRtcOptions.mediaConstraints = {
                audio: options.hasAudio,
                video: true
            };
        }

        return webRtcOptions;
    }

    /**
     * Prepare Recorder endpoint options based on recording mode
     * 
     * @param options Endpoint creation options
     * @returns Recorder endpoint options
     */
    private prepareRecorderOptions(options: EndpointCreationOptions): RecorderEndpointOptions {
        // Ensure the file URI is in the correct format for Kurento
        const uri = this.createFileUri(options.filePath);

        const recorderOptions: RecorderEndpointOptions = {
            uri,
            mediaProfile: options.mediaProfile,
            ...DEFAULT_RECORDER_OPTIONS,
            ...options.recorderOptions
        };

        return recorderOptions;
    }

    /**
     * Create a file URI from a file path
     * 
     * @param filePath File path
     * @returns File URI
     */
    private createFileUri(filePath: string): string {
        // Normalize path and convert to Kurento URI format
        const normalizedPath = path.normalize(filePath);

        // If path is absolute, convert it to a file URI
        if (path.isAbsolute(normalizedPath)) {
            // Format: file:///path/to/file
            return `file://${normalizedPath.replace(/\\/g, '/')}`;
        }

        // For relative paths, assume they're relative to the Kurento server's location
        return normalizedPath.replace(/\\/g, '/');
    }

    /**
     * Get the WebRTC endpoint
     * 
     * @returns WebRTC endpoint or null
     */
    getWebRtcEndpoint(): WebRtcEndpoint | null {
        return this.webRtcEndpoint;
    }

    /**
     * Get the Recorder endpoint
     * 
     * @returns Recorder endpoint or null
     */
    getRecorderEndpoint(): RecorderEndpoint | null {
        return this.recorderEndpoint;
    }

    /**
     * Check if recording is active
     * 
     * @returns true if recording, false otherwise
     */
    isRecordingActive(): boolean {
        return this.isRecording;
    }

    /**
     * Connect a blank screen element to the recorder
     * Used during paused recording to show a blank screen
     * 
     * @param blankElement The blank screen element to connect
     * @returns Promise resolving when connected
     */
    async connectBlankScreen(blankElement: any): Promise<void> {
        if (!this.recorderEndpoint) {
            throw new MediaError(
                'Recorder endpoint not created',
                ErrorCode.MEDIA_CONNECTION_ERROR
            );
        }

        try {
            this.logger.info('Connecting blank screen to recorder');

            // Store the blank screen element for later use
            this.blankScreenElement = blankElement;

            // Disconnect current source if connected (for video only)
            if (this.webRtcEndpoint) {
                try {
                    // We need to disconnect only if we're recording video
                    if (this.recordingMode === RecordingMode.AUDIO_VIDEO ||
                        this.recordingMode === RecordingMode.VIDEO_ONLY) {
                        this.logger.debug('Disconnecting WebRTC video from recorder');

                        // Disconnect the video connection between webRTC and recorder
                        await this.disconnectEndpoints(
                            this.webRtcEndpoint,
                            this.recorderEndpoint,
                            'VIDEO'
                        );
                    }
                } catch (error) {
                    this.logger.warn('Error disconnecting WebRTC video source', { error });
                    // Continue anyway since this is not critical
                }
            }

            // Connect the blank screen element to recorder (video only)
            this.logger.debug('Connecting blank screen element to recorder');
            await this.pipeline.connect(this.blankScreenElement, this.recorderEndpoint, 'VIDEO');

            this.logger.info('Blank screen connected to recorder successfully');
        } catch (error: any) {
            this.logger.error('Error connecting blank screen', { error });
            throw new MediaError(
                `Failed to connect blank screen: ${error.message}`,
                ErrorCode.MEDIA_CONNECTION_ERROR,
                error
            );
        }
    }

    /**
     * Disconnect the blank screen and reconnect original source
     * 
     * @returns Promise resolving when reconnected
     */
    async disconnectBlankScreen(): Promise<void> {
        if (!this.recorderEndpoint || !this.webRtcEndpoint) {
            throw new MediaError(
                'Endpoints not created, cannot disconnect blank screen',
                ErrorCode.MEDIA_CONNECTION_ERROR
            );
        }

        try {
            this.logger.info('Disconnecting blank screen from recorder');

            // Disconnect blank screen if connected
            if (this.blankScreenElement) {
                try {
                    await this.disconnectEndpoints(
                        this.blankScreenElement,
                        this.recorderEndpoint,
                        'VIDEO'
                    );
                } catch (error) {
                    this.logger.warn('Error disconnecting blank screen', { error });
                    // Continue anyway
                }
            }

            // Reconnect original source based on recording mode
            if (this.recordingMode === RecordingMode.AUDIO_VIDEO ||
                this.recordingMode === RecordingMode.VIDEO_ONLY) {
                await this.pipeline.connect(this.webRtcEndpoint, this.recorderEndpoint, 'VIDEO');
            }

            this.logger.info('Original source reconnected to recorder');
        } catch (error: any) {
            this.logger.error('Error disconnecting blank screen', { error });
            throw new MediaError(
                `Failed to disconnect blank screen: ${error.message}`,
                ErrorCode.MEDIA_CONNECTION_ERROR,
                error
            );
        }
    }

    /**
     * Helper method to disconnect endpoints 
     * This is a workaround since Kurento doesn't have a direct disconnect method
     * 
     * @param source Source endpoint
     * @param sink Sink endpoint
     * @param type Media type (AUDIO, VIDEO)
     */
    private async disconnectEndpoints(
        source: any,
        sink: any,
        type?: 'AUDIO' | 'VIDEO'
    ): Promise<void> {
        try {
            // In Kurento, disconnection is done at the source level
            await source.disconnect(sink, type);
        } catch (error) {
            // If the direct method fails, fall back to using release and recreation
            this.logger.warn('Direct disconnect failed, using workaround', { error });

            // TODO: Implement a more robust disconnection mechanism if needed
            // This might include tracking connections and recreating them without the one to remove
        }
    }
} 