/**
 * WebRTC-specific types for the Recording SDK
 */

/**
 * Session Description Protocol (SDP) data
 */
export interface SdpData {
    /** SDP type (offer, answer, etc.) */
    type: 'offer' | 'answer' | 'pranswer' | 'rollback';
    /** SDP content string */
    sdp: string;
}

/**
 * WebRTC configuration options
 */
export interface WebRTCConfig {
    /** ICE servers for NAT traversal */
    iceServers?: RTCIceServer[];
    /** ICE transport policy */
    iceTransportPolicy?: RTCIceTransportPolicy;
    /** Bundle policy for media tracks */
    bundlePolicy?: RTCBundlePolicy;
    /** RTC certificate configuration */
    certificates?: RTCCertificate[];
}

/**
 * WebRTC connection statistics
 */
export interface WebRTCStats {
    /** Round-trip time in milliseconds */
    rtt?: number;
    /** Jitter in milliseconds */
    jitter?: number;
    /** Packet loss percentage */
    packetLoss?: number;
    /** Available bandwidth estimation in kbps */
    availableBandwidth?: number;
    /** Bytes received */
    bytesReceived?: number;
    /** Bytes sent */
    bytesSent?: number;
    /** Timestamp of measurement */
    timestamp: number;
    /** Media type (audio/video) these stats refer to */
    mediaType?: 'audio' | 'video' | 'combined';
}

/**
 * ICE candidate data
 */
export interface IceCandidate {
    /** Candidate string */
    candidate: string;
    /** SDP media ID */
    sdpMid: string | null;
    /** SDP media line index */
    sdpMLineIndex: number | null;
    /** Username fragment */
    usernameFragment?: string | null;
}

/**
 * WebRTC connection state
 */
export enum WebRTCConnectionState {
    NEW = 'new',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    FAILED = 'failed',
    CLOSED = 'closed'
} 