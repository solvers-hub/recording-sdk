/**
 * Error classes for the Recording SDK
 */

import { ErrorCode } from '../constants';
import { RecordingError } from './RecordingError';

/**
 * Connection related errors
 */
export class ConnectionError extends RecordingError {
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message, code, details);
        this.name = 'ConnectionError';
    }
}

/**
 * Session management errors
 */
export class SessionError extends RecordingError {
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message, code, details);
        this.name = 'SessionError';
    }
}

/**
 * Media handling errors
 */
export class MediaError extends RecordingError {
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message, code, details);
        this.name = 'MediaError';
    }
}

/**
 * WebRTC-specific errors
 */
export class WebRTCError extends RecordingError {
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message, code, details);
        this.name = 'WebRTCError';
    }
}

/**
 * Configuration and validation errors
 */
export class ConfigError extends RecordingError {
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message, code, details);
        this.name = 'ConfigError';
    }
}

/**
 * File system and I/O errors
 */
export class IOError extends RecordingError {
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message, code, details);
        this.name = 'IOError';
    }
}

// Export base error class
export { RecordingError } from './RecordingError'; 