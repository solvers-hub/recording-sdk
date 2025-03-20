/**
 * WebRTCHandler: Manages WebRTC signaling and negotiation
 */

import { Logger } from '../utils';
import { WebRTCError } from '../errors';
import { ErrorCode } from '../constants';
import {
    WebRtcEndpoint,
    SdpData,
    WebRTCStats,
    IceCandidate
} from '../types';

/**
 * Handles WebRTC functionality including SDP processing and ICE candidates
 */
export class WebRTCHandler {
    private logger: Logger;
    private webRtcEndpoint: WebRtcEndpoint | null = null;
    private pendingCandidates: IceCandidate[] = [];
    private stats: WebRTCStats = { timestamp: Date.now() };

    /**
     * Create a new WebRTCHandler
     * 
     * @param logger Logger instance
     */
    constructor(logger: Logger) {
        this.logger = logger.createChild({ name: 'WebRTCHandler' });
    }

    /**
     * Set the WebRTC endpoint to use
     * 
     * @param endpoint WebRTC endpoint
     */
    setEndpoint(endpoint: WebRtcEndpoint): void {
        this.webRtcEndpoint = endpoint;
        this.logger.debug('WebRTC endpoint set');

        // Set up ICE candidate event listener
        this.setupIceCandidateListener();

        // Apply any pending ICE candidates
        if (this.pendingCandidates.length > 0) {
            this.logger.debug(`Applying ${this.pendingCandidates.length} pending ICE candidates`);
            this.applyPendingCandidates();
        }
    }

    /**
     * Process an SDP offer and generate an answer
     * 
     * @param sdpOffer SDP offer string or object
     * @returns The generated SDP answer
     */
    async processOffer(sdpOffer: string | SdpData): Promise<SdpData> {
        if (!this.webRtcEndpoint) {
            throw new WebRTCError(
                'WebRTC endpoint not set, cannot process offer',
                ErrorCode.WEBRTC_OFFER_ERROR
            );
        }

        try {
            const offerSdp = typeof sdpOffer === 'string' ? sdpOffer : sdpOffer.sdp;
            this.logger.debug('Processing SDP offer');

            // Process the offer and generate an answer
            const answerSdp = await this.webRtcEndpoint.processOffer(offerSdp);
            this.logger.debug('SDP answer generated successfully');

            return {
                type: 'answer',
                sdp: answerSdp
            };
        } catch (error: any) {
            this.logger.error('Error processing SDP offer', { error });
            throw new WebRTCError(
                `Error processing SDP offer: ${error.message}`,
                ErrorCode.WEBRTC_OFFER_ERROR,
                error
            );
        }
    }

    /**
     * Gather ICE candidates for the WebRTC endpoint
     */
    async gatherCandidates(): Promise<void> {
        if (!this.webRtcEndpoint) {
            throw new WebRTCError(
                'WebRTC endpoint not set, cannot gather candidates',
                ErrorCode.WEBRTC_ICE_ERROR
            );
        }

        try {
            this.logger.debug('Starting ICE candidate gathering');
            await this.webRtcEndpoint.gatherCandidates();
            this.logger.debug('ICE candidate gathering initiated');
        } catch (error: any) {
            this.logger.error('Error gathering ICE candidates', { error });
            throw new WebRTCError(
                `Error gathering ICE candidates: ${error.message}`,
                ErrorCode.WEBRTC_ICE_ERROR,
                error
            );
        }
    }

    /**
     * Add an ICE candidate to the WebRTC endpoint
     * 
     * @param candidate ICE candidate to add
     */
    async addIceCandidate(candidate: IceCandidate): Promise<void> {
        if (!this.webRtcEndpoint) {
            // Store the candidate for later if the endpoint isn't ready yet
            this.logger.debug('WebRTC endpoint not ready, storing ICE candidate for later');
            this.pendingCandidates.push(candidate);
            return;
        }

        try {
            this.logger.debug('Adding ICE candidate', { candidate });
            await this.webRtcEndpoint.addIceCandidate(candidate);
            this.logger.debug('ICE candidate added successfully');
        } catch (error: any) {
            this.logger.error('Error adding ICE candidate', { error, candidate });
            throw new WebRTCError(
                `Error adding ICE candidate: ${error.message}`,
                ErrorCode.WEBRTC_ICE_ERROR,
                error
            );
        }
    }

    /**
     * Set quality parameters on the WebRTC endpoint
     * 
     * @param minBitrate Minimum bitrate in kbps
     * @param maxBitrate Maximum bitrate in kbps
     */
    async setQualityParameters(minBitrate: number, maxBitrate: number): Promise<void> {
        if (!this.webRtcEndpoint) {
            throw new WebRTCError(
                'WebRTC endpoint not set, cannot set quality parameters',
                ErrorCode.WEBRTC_OFFER_ERROR
            );
        }

        try {
            this.logger.debug('Setting quality parameters', { minBitrate, maxBitrate });

            if (minBitrate > 0) {
                await this.webRtcEndpoint.setMinVideoSendBandwidth(minBitrate);
            }

            if (maxBitrate > 0) {
                await this.webRtcEndpoint.setMaxVideoSendBandwidth(maxBitrate);
            }

            this.logger.debug('Quality parameters set successfully');
        } catch (error: any) {
            this.logger.error('Error setting quality parameters', { error, minBitrate, maxBitrate });
            throw new WebRTCError(
                `Error setting quality parameters: ${error.message}`,
                ErrorCode.WEBRTC_OFFER_ERROR,
                error
            );
        }
    }

    /**
     * Get WebRTC connection statistics
     * 
     * @returns Current WebRTC stats
     */
    getStats(): WebRTCStats {
        return { ...this.stats };
    }

    /**
     * Set up ICE candidate event listener on the WebRTC endpoint
     */
    private setupIceCandidateListener(): void {
        if (!this.webRtcEndpoint) return;

        this.webRtcEndpoint.on('IceCandidateFound', (event: any) => {
            this.logger.debug('New ICE candidate found', { candidate: event.candidate });
            // This would typically be emitted to allow sending to the client
            // Implementation would depend on how events are handled in the SDK
        });
    }

    /**
     * Apply any pending ICE candidates to the WebRTC endpoint
     */
    private async applyPendingCandidates(): Promise<void> {
        if (!this.webRtcEndpoint || this.pendingCandidates.length === 0) return;

        const candidates = [...this.pendingCandidates];
        this.pendingCandidates = [];

        for (const candidate of candidates) {
            try {
                await this.webRtcEndpoint.addIceCandidate(candidate);
                this.logger.debug('Applied pending ICE candidate');
            } catch (error: any) {
                this.logger.warn('Error applying pending ICE candidate', { error, candidate });
                // Don't throw here - we want to try all candidates
            }
        }
    }

    /**
     * Check if the handler has an active WebRTC endpoint
     * 
     * @returns true if an endpoint is available, false otherwise
     */
    hasEndpoint(): boolean {
        return this.webRtcEndpoint !== null;
    }

    /**
     * Get the WebRTC endpoint, if available
     * 
     * @returns The WebRTC endpoint or null
     */
    getEndpoint(): WebRtcEndpoint | null {
        return this.webRtcEndpoint;
    }

    /**
     * Release the WebRTC endpoint
     */
    async releaseEndpoint(): Promise<void> {
        if (!this.webRtcEndpoint) return;

        try {
            this.logger.debug('Releasing WebRTC endpoint');
            await this.webRtcEndpoint.release();
            this.webRtcEndpoint = null;
            this.logger.debug('WebRTC endpoint released successfully');
        } catch (error: any) {
            this.logger.error('Error releasing WebRTC endpoint', { error });
            throw new WebRTCError(
                `Error releasing WebRTC endpoint: ${error.message}`,
                ErrorCode.WEBRTC_OFFER_ERROR,
                error
            );
        }
    }
}
