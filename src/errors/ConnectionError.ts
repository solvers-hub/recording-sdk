import { RecordingError } from './RecordingError';
import { ErrorCode } from '../constants/ErrorCodes';

/**
 * Error thrown when there is a problem with the connection to Kurento
 */
export class ConnectionError extends RecordingError {
    constructor(message: string, code: ErrorCode, details?: any) {
        super(message, code, details);
        this.name = 'ConnectionError';
    }
} 