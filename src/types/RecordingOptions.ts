/**
 * Recording SDK configuration and options types
 */

/**
 * Logging verbosity levels
 */
export enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    DEBUG = 'debug',
    TRACE = 'trace'
}

/**
 * Recording quality presets
 */
export enum RecordingQuality {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    ULTRA = 'ultra'
}

/**
 * Media profiles for recording
 */
export enum MediaProfile {
    WEBM = 'WEBM',
    WEBM_VIDEO_ONLY = 'WEBM_VIDEO_ONLY',
    WEBM_AUDIO_ONLY = 'WEBM_AUDIO_ONLY',
    MP4 = 'MP4',
    MP4_VIDEO_ONLY = 'MP4_VIDEO_ONLY',
    MP4_AUDIO_ONLY = 'MP4_AUDIO_ONLY',
}

/**
 * Content sharing type
 */
export enum ShareType {
    SCREEN = 'screen',
    WINDOW = 'window',
    BROWSER = 'browser',
    APPLICATION = 'application',
    UNKNOWN = 'unknown'
}

/**
 * Recording mode (audio+video, audio-only, video-only)
 */
export enum RecordingMode {
    AUDIO_VIDEO = 'audio-video',
    AUDIO_ONLY = 'audio-only',
    VIDEO_ONLY = 'video-only'
}

/**
 * Pause type for selective pausing
 */
export enum PauseType {
    /** Pause both audio and video */
    BOTH = 'both',
    /** Pause only video, continue recording audio */
    VIDEO_ONLY = 'video-only',
    /** Pause only audio, continue recording video */
    AUDIO_ONLY = 'audio-only'
}

/**
 * RecordingManager configuration
 */
export interface RecordingManagerConfig {
    /** Kurento WebSocket URL */
    kurentoUrl: string;
    /** Number of reconnection attempts (default: 5) */
    reconnectAttempts?: number;
    /** Milliseconds between retries (default: 2000) */
    reconnectInterval?: number;
    /** Logging verbosity (default: INFO) */
    logLevel?: LogLevel;
    /** Directory for temporary files (default: system temp) */
    tempDir?: string;
    /** Custom logger instance (Winston, Pino, etc.) that implements the ILogger interface */
    logger?: any;
    /** Whether to preserve pipelines during disconnection (default: false) */
    preservePipelinesOnDisconnect?: boolean;
    /** Maximum time in milliseconds to wait for reconnection before releasing pipelines (default: 30000) */
    maxReconnectionTimeMs?: number;
}

/**
 * Quality parameters for recordings
 */
export interface QualityParams {
    /** Maximum bitrate in kbps */
    maxBitrate: number;
    /** Minimum bitrate in kbps */
    minBitrate: number;
    /** Target frame rate */
    frameRate: number;
    /** Encoding quality level (1-10, where 1 is highest quality) */
    qualityLevel: number;
}

/**
 * Recording session options
 */
export interface RecordingSessionOptions {
    /** Optional custom session ID (random UUID if not provided) */
    sessionId?: string;
    /** Media container format */
    mediaProfile?: MediaProfile;
    /** Quality preset */
    quality?: RecordingQuality;
    /** Maximum bitrate in kbps (overrides quality preset) */
    maxBitrate?: number;
    /** Minimum bitrate in kbps (overrides quality preset) */
    minBitrate?: number;
    /** Recording mode (audio+video, audio-only, video-only) */
    recordingMode?: RecordingMode;
    /** Whether to expect audio in the media stream */
    hasAudio?: boolean;
    /** Expected video width */
    width?: number;
    /** Expected video height */
    height?: number;
    /** Target frame rate (overrides quality preset) */
    frameRate?: number;
    /** Type of content being shared */
    shareType?: ShareType;
    /** Custom recording file path (default: tempDir/sessionId.ext) */
    filePath?: string;
    /** Whether to insert blank screen during paused periods (default: true) */
    insertBlankScreenOnPause?: boolean;
    /** Color of the blank screen when paused (default: "black") */
    blankScreenColor?: string;
}

/**
 * Recording result returned when stopping a recording
 */
export interface RecordingResult {
    /** File path to the recording */
    path: string;
    /** Duration in seconds */
    duration: number;
    /** File size in bytes if available */
    size?: number;
    /** Format used */
    mediaProfile: MediaProfile;
    /** Session identifier */
    sessionId: string;
    /** Recording timestamps */
    timestamp: {
        /** Start timestamp (milliseconds since epoch) */
        start: number;
        /** End timestamp (milliseconds since epoch) */
        end: number;
    };
} 