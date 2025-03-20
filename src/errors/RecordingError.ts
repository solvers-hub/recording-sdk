/**
 * Base error class for Recording SDK
 */

import { ErrorCode } from '../constants';

/**
 * Base class for all Recording SDK errors
 */
export class RecordingError extends Error {
    /** Error code */
    code: ErrorCode;

    /** Additional error details (if any) */
    details?: any;

    /**
     * Create a new RecordingError
     * 
     * @param message Error message
     * @param code Error code
     * @param details Additional error details (optional)
     */
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message);

        // Set name explicitly for better stack traces
        this.name = 'RecordingError';

        // Assign error code and details
        this.code = code;
        this.details = details;

        // Maintains proper stack trace for where error was thrown (only in V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RecordingError);
        }
    }
} 