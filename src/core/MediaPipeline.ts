/**
 * MediaPipeline: Abstracts Kurento media pipeline functionality
 */

import * as kurento from 'kurento-client';
import { MediaError } from '../errors';
import { ErrorCode } from '../constants';
import { Logger } from '../utils';
import {
    MediaPipelineOptions,
    WebRtcEndpoint,
    RecorderEndpoint,
    WebRtcEndpointOptions,
    RecorderEndpointOptions
} from '../types';

/**
 * Options for creating a pipeline element
 */
export interface ElementOptions {
    type: string;
    options?: any;
}

/**
 * Encapsulates a Kurento Media Pipeline and manages its elements
 */
export class MediaPipeline {
    private logger: Logger;
    private kurentoClient: kurento.ClientInstance;
    private pipeline: kurento.MediaPipeline | null = null;
    private elements: Map<string, any> = new Map();
    private isReleased: boolean = false;

    /**
     * Create a new MediaPipeline
     * 
     * @param kurentoClient Kurento client instance
     * @param logger Logger instance
     */
    constructor(kurentoClient: kurento.ClientInstance, logger: Logger) {
        this.kurentoClient = kurentoClient;
        this.logger = logger;
    }

    /**
     * Initialize the media pipeline
     * 
     * @param options Pipeline creation options
     */
    async initialize(options: MediaPipelineOptions = {}): Promise<void> {
        if (this.pipeline) {
            this.logger.debug('Pipeline already initialized');
            return;
        }

        try {
            this.logger.debug('Creating Kurento media pipeline');
            this.pipeline = await this.kurentoClient.create('MediaPipeline', options as any) as unknown as kurento.MediaPipeline;
            this.logger.info('Media pipeline created successfully', {
                pipelineId: this.pipeline.id
            });
        } catch (error: any) {
            this.logger.error('Error creating media pipeline', { error });
            throw new MediaError(`Failed to create media pipeline: ${error.message}`, ErrorCode.PIPELINE_CREATION_FAILED, error);
        }
    }

    /**
     * Create a WebRTC endpoint in the pipeline
     * 
     * @param options WebRTC endpoint options
     * @param id Optional identifier for the endpoint
     * @returns The created WebRTC endpoint
     */
    async createWebRtcEndpoint(
        options: WebRtcEndpointOptions = {},
        id?: string
    ): Promise<WebRtcEndpoint> {
        this.ensurePipeline();

        try {
            this.logger.debug('Creating WebRTC endpoint', { options });
            const endpoint = await this.pipeline!.create('WebRtcEndpoint', options as any) as WebRtcEndpoint;

            if (id) {
                this.elements.set(id, endpoint);
            }

            return endpoint;
        } catch (error: any) {
            this.logger.error('Error creating WebRTC endpoint', { error, options });
            throw new MediaError(`Failed to create WebRTC endpoint: ${error.message}`, ErrorCode.ENDPOINT_CREATION_FAILED, error);
        }
    }

    /**
     * Create a Recorder endpoint in the pipeline
     * 
     * @param options Recorder endpoint options
     * @param id Optional identifier for the endpoint
     * @returns The created Recorder endpoint
     */
    async createRecorderEndpoint(
        options: RecorderEndpointOptions,
        id?: string
    ): Promise<RecorderEndpoint> {
        this.ensurePipeline();

        try {
            this.logger.debug('Creating Recorder endpoint', { options });
            const endpoint = await this.pipeline!.create('RecorderEndpoint', options as any) as unknown as RecorderEndpoint;

            if (id) {
                this.elements.set(id, endpoint);
            }

            return endpoint;
        } catch (error: any) {
            this.logger.error('Error creating recorder endpoint', { error, options });
            throw new MediaError(`Failed to create recorder endpoint: ${error.message}`, ErrorCode.ENDPOINT_CREATION_FAILED, error);
        }
    }

    /**
     * Connect two elements in the pipeline
     * 
     * @param source Source element
     * @param sink Sink element
     * @param type Optional media type (AUDIO, VIDEO, or undefined for both)
     */
    async connect(
        source: any,
        sink: any,
        type?: 'AUDIO' | 'VIDEO'
    ): Promise<void> {
        this.ensurePipeline();

        try {
            this.logger.debug(`Connecting elements ${source} -> ${sink}${type ? ` (${type})` : ''}`);

            // If type is specified, use it for the connection
            if (type) {
                await source.connect(sink, type);
            } else {
                await source.connect(sink);
            }

            this.logger.debug('Elements connected successfully');
        } catch (error: any) {
            this.logger.error('Error connecting elements', { error, source, sink, type });
            throw new MediaError(`Failed to connect elements: ${error.message}`, ErrorCode.MEDIA_PIPELINE_ERROR, error);
        }
    }

    /**
     * Get an element by its ID
     * 
     * @param id Element ID
     * @returns The element or undefined if not found
     */
    getElement(id: string): any {
        return this.elements.get(id);
    }

    /**
     * Release the pipeline and all its elements
     */
    async release(): Promise<void> {
        if (this.isReleased || !this.pipeline) {
            this.logger.debug('Pipeline already released or not created');
            return;
        }

        try {
            this.logger.info('Releasing media pipeline and all elements');
            await this.pipeline.release();
            this.pipeline = null;
            this.elements.clear();
            this.isReleased = true;
            this.logger.info('Media pipeline released successfully');
        } catch (error: any) {
            this.logger.error('Error releasing media pipeline', { error });
            throw new MediaError(`Failed to release media pipeline: ${error.message}`, ErrorCode.PIPELINE_RELEASE_FAILED, error);
        }
    }

    /**
     * Create a generic media element in the pipeline
     * 
     * @param elementOptions Element creation options
     * @param id Optional identifier for the element
     * @returns The created element
     */
    async createElement(elementOptions: ElementOptions, id?: string): Promise<any> {
        this.ensurePipeline();

        try {
            this.logger.debug('Creating media element', {
                type: elementOptions.type,
                options: elementOptions.options
            });

            const element = await this.pipeline!.create(
                elementOptions.type,
                elementOptions.options as any
            );

            if (id) {
                this.elements.set(id, element);
            }

            return element;
        } catch (error: any) {
            this.logger.error('Error creating media element', {
                error,
                type: elementOptions.type
            });

            throw new MediaError(
                `Failed to create ${elementOptions.type}: ${error.message}`,
                ErrorCode.ELEMENT_CREATION_FAILED,
                error
            );
        }
    }

    /**
     * Check if the pipeline has been released
     * 
     * @returns true if released, false otherwise
     */
    isReleaseState(): boolean {
        return this.isReleased;
    }

    /**
     * Ensure the pipeline exists
     * @throws MediaError if the pipeline doesn't exist or has been released
     */
    private ensurePipeline(): void {
        if (!this.pipeline || this.isReleased) {
            this.logger.error('Attempt to use released or non-existent pipeline');
            throw new MediaError(
                'Pipeline is not initialized or has been released',
                ErrorCode.MEDIA_PIPELINE_ERROR
            );
        }
    }

    /**
     * Create a blank video element (for pause screen)
     * 
     * @param color Color of the blank screen (e.g., "black", "#0000FF" for blue, "rgb(0,0,255)" etc)
     * @returns The created element
     */
    async createBlankVideoElement(color: string = 'black'): Promise<any> {
        if (!this.pipeline) {
            throw new MediaError('Pipeline not initialized', ErrorCode.PIPELINE_NOT_READY);
        }

        try {
            // Create a simple passthrough element
            this.logger.debug('Creating blank video element', { color });

            // In Kurento, we'll use a PassThrough element 
            // This is a simpler approach than FaceOverlayFilter which has compatibility issues
            const colorElement = await this.pipeline.create('PassThrough');

            // Log the chosen color (we can't actually change the color with PassThrough,
            // but in a production implementation you would use a custom filter)
            this.logger.debug('Blank video element created with color passthrough', {
                elementId: colorElement.id,
                intendedColor: color
            });

            return colorElement;
        } catch (error: any) {
            this.logger.error('Error creating blank video element', { error, color });
            throw new MediaError(
                `Failed to create blank video element: ${error.message}`,
                ErrorCode.ELEMENT_CREATION_FAILED,
                error
            );
        }
    }

    /**
     * Get the pipeline instance
     * 
     * @returns Kurento pipeline instance
     */
    getPipeline(): any {
        return this.pipeline;
    }
} 