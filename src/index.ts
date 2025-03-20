/**
 * Recording SDK
 * 
 * @module recording-sdk
 */

// Export core classes (main API for consumers)
export { RecordingManager } from './core/RecordingManager';
export { RecordingSession, RecordingSessionEvents } from './core/RecordingSession';

// Export types and enums
export {
    RecordingManagerConfig,
    RecordingSessionOptions,
    RecordingResult,
    RecordingQuality,
    RecordingMode,
    MediaProfile,
    ShareType,
    LogLevel,
    ILogger,
    PauseType,
    RecordingState,
    // WebRTC types
    SdpData,
    IceCandidate
} from './types';

// Export error types
export {
    RecordingError,
    ConnectionError,
    SessionError,
    MediaError,
    WebRTCError,
    ConfigError
} from './errors';

// Export constants
export { ErrorCode } from './constants/ErrorCodes';

// Export internal classes for documentation
export { ConfigManager } from './utils/ConfigManager';
export { Logger } from './utils/Logger';
export { KurentoConnector } from './core/KurentoConnector';
export { EndpointManager } from './core/EndpointManager';
export { MediaPipeline } from './core/MediaPipeline';
export { WebRTCHandler } from './core/WebRTCHandler';