/**
 * Export core components of the Recording SDK
 */

export { RecordingManager } from './RecordingManager';
export { RecordingSession } from './RecordingSession';
export { MediaPipeline } from './MediaPipeline';
export { WebRTCHandler } from './WebRTCHandler';
export { EndpointManager } from './EndpointManager';

// Add a placeholder for KurentoConnector until the file is properly implemented
// This will be properly exported once KurentoConnector is fully implemented
export interface KurentoConnector {
    connect(): Promise<any>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getClient(): any;
} 