/**
 * Kurento Media Server specific types
 */

// Import necessary Kurento client types if available
// This is a simplified version - actual implementation may use imported types
// from the kurento-client library

/**
 * Kurento connection options
 */
export interface KurentoConnectionOptions {
    /** Kurento WebSocket URL */
    kurentoUrl: string;
    /** Whether to reconnect on connection failure */
    reconnect?: boolean;
    /** Maximum number of reconnection attempts */
    reconnectAttempts?: number;
    /** Interval between reconnection attempts (ms) */
    reconnectInterval?: number;
    /** Base delay between reconnection attempts (ms) */
    reconnectBaseDelay?: number;
    /** Maximum delay between reconnection attempts (ms) */
    reconnectMaxDelay?: number;
    /** Additional Kurento client options */
    kurentoOptions?: any;
}

/**
 * WebRTC endpoint quality configuration options
 */
export interface WebRtcEndpointOptions {
    /** Whether to use IPv6 (default: false) */
    useIpv6?: boolean;
    /** Minimum video bandwidth for sending (kbps) */
    minVideoSendBandwidth?: number;
    /** Maximum video bandwidth for sending (kbps) */
    maxVideoSendBandwidth?: number;
    /** Minimum video bandwidth for receiving (kbps) */
    minVideoRecvBandwidth?: number;
    /** Maximum video bandwidth for receiving (kbps) */
    maxVideoRecvBandwidth?: number;
    /** Media constraints for the endpoint */
    mediaConstraints?: {
        audio?: boolean;
        video?: boolean;
    };
    /** QoS DSCP value for packet marking */
    dscp?: number;
    /** Network interfaces for ICE gathering */
    networkInterfaces?: string[];
    /** Minimum quantization parameter (lower = higher quality) */
    minQP?: number;
    /** Maximum quantization parameter (higher = lower quality) */
    maxQP?: number;
}

/**
 * Recorder endpoint configuration options
 */
export interface RecorderEndpointOptions {
    /** URI where the recording will be stored */
    uri: string;
    /** Media profile for the recording */
    mediaProfile?: string;
    /** Whether to stop recording when end of stream is detected */
    stopOnEndOfStream?: boolean;
    /** Recording quality (0-10) */
    quality?: number;
}

/**
 * Pipeline creation options
 */
export interface MediaPipelineOptions {
    /** Clock rate for all components in the pipeline (Hz) */
    garbageCollectorPeriod?: number;
    /** Whether to use timestamps from sources */
    useTimestamps?: boolean;
}

/**
 * Common Kurento media element types
 * These are placeholders for actual Kurento types
 */
export interface KurentoClient {
    create(type: string, options?: any): Promise<any>;
    release(): Promise<void>;
    on(event: string, callback: Function): void;
}

export interface MediaPipeline {
    create(type: string, options?: any): Promise<any>;
    release(): Promise<void>;
    connect(source: any, sink: any, type?: string): Promise<void>;
}

export interface WebRtcEndpoint {
    processOffer(sdpOffer: string): Promise<string>;
    gatherCandidates(): Promise<void>;
    addIceCandidate(candidate: any): Promise<void>;
    connect(sink: any, type?: string): Promise<void>;
    release(): Promise<void>;
    on(event: string, callback: Function): void;
    setMinVideoSendBandwidth(bandwidth: number): Promise<void>;
    setMaxVideoSendBandwidth(bandwidth: number): Promise<void>;
}

export interface RecorderEndpoint {
    record(): Promise<void>;
    stop(): Promise<void>;
    release(): Promise<void>;
    getState(): Promise<string>;
}

/**
 * ICE candidate from Kurento
 */
export interface KurentoIceCandidate {
    candidate: string;
    sdpMid: string;
    sdpMLineIndex: number;
} 