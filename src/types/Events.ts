/**
 * Event-related types for the Recording SDK
 */

/**
 * Recording event types
 */
export type RecordingEventType =
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'connection-failed'
    | 'session-created'
    | 'session-ready'
    | 'recording-started'
    | 'recording-stopped'
    | 'quality-changed'
    | 'error'
    | 'ice-candidate'
    | 'network-quality';

/**
 * Recording session state
 */
export enum RecordingState {
    /** Initial state after session creation */
    CREATED = 'created',
    /** Session ready to accept WebRTC offers */
    READY = 'ready',
    /** Recording in progress */
    RECORDING = 'recording',
    /** Recording paused */
    PAUSED = 'paused',
    /** Recording stopped */
    STOPPED = 'stopped',
    /** Error state */
    ERROR = 'error'
}

/**
 * Network quality event data
 */
export interface NetworkQualityEvent {
    /** Current bandwidth estimation in kbps */
    bandwidth: number;
    /** Round-trip time in milliseconds */
    rtt: number;
    /** Packet loss percentage (0-100) */
    packetLoss: number;
    /** Quality rating (1-5, where 5 is best) */
    qualityRating: number;
    /** Timestamp of measurement */
    timestamp: number;
}

/**
 * Quality changed event data
 */
export interface QualityChangedEvent {
    /** New maximum bitrate in kbps */
    maxBitrate: number;
    /** New minimum bitrate in kbps */
    minBitrate: number;
    /** New target frame rate */
    frameRate?: number;
    /** New quality level */
    qualityLevel?: number;
    /** Quality change reason */
    reason: 'network' | 'user' | 'auto';
    /** Timestamp of change */
    timestamp: number;
}

/**
 * ICE candidate event
 */
export interface IceCandidateEvent {
    /** ICE candidate data */
    candidate: RTCIceCandidate;
    /** Session ID */
    sessionId: string;
} 