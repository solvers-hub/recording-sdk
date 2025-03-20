/**
 * Basic Express server example demonstrating how to use the Recording SDK
 */

import express from 'express';
import * as http from 'http';
import { WebSocketServer } from 'ws';
import * as path from 'path';
// Importing directly from src for development "../src"
// In a real app, you would use: import { ... } from 'recording-sdk';
import {
    RecordingManager,
    RecordingSession,
    RecordingQuality,
    MediaProfile,
    RecordingMode,
} from 'recording-sdk';
import cors from 'cors';

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Create WebSocket server for signaling
const wss = new WebSocketServer({ server });

// Create recording manager with prettier logs
const recordingManager = new RecordingManager({
    kurentoUrl: 'ws://localhost:8888/kurento',
    reconnectAttempts: 5,
    tempDir: '/recordings',  // Linux-style path inside the container
    // Enable pipeline preservation during disconnections
    preservePipelinesOnDisconnect: true,
    // Auto-release pipelines after 30 seconds if no reconnection
    maxReconnectionTimeMs: 30000
});

// Store active sessions
const sessions: Map<string, RecordingSession> = new Map();

// Allow all origins
app.use(
    cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    })
);

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
    return res.status(200).json({
        status: 'ok',
        message: 'Server is running',
        kurentoConnected: recordingManager.isConnected()
    });
});

// API endpoint to get recording result
app.get('/api/recordings/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const session = recordingManager.getSession(sessionId);

        if (!session) {
            return res.status(404).json({
                error: 'Session not found',
                message: `No recording session found with ID ${sessionId}`
            });
        }

        return res.json({
            sessionId,
            state: session.getState(),
            options: session.getOptions(),
            filePath: session.getFilePath()
        });
    } catch (error: any) {
        console.error('Error getting recording info:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API endpoint to stop recording
app.post('/api/recordings/:sessionId/stop', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await recordingManager.stopSession(sessionId);
        return res.json({
            success: true,
            result
        });
    } catch (error: any) {
        console.error('Error stopping recording:', error);
        return res.status(500).json({
            error: 'Failed to stop recording',
            message: error.message
        });
    }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    // Handle incoming WebSocket messages
    ws.on('message', async (message: string) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data.action);

            switch (data.action) {
                case 'start': {
                    try {
                        // Initialize recording manager if not connected
                        if (!recordingManager.isConnected()) {
                            await recordingManager.connect();
                        }

                        // Create a new recording session
                        const sessionId = data.sessionId || generateSessionId();
                        const isAudioOnly = !!data.audioOnly;
                        const format = data.format || 'webm';

                        console.log(`Creating ${isAudioOnly ? 'audio-only' : 'screen+audio'} recording session (${format}): ${sessionId}`);

                        // Determine the appropriate media profile based on recording mode and format
                        let mediaProfile: MediaProfile;
                        if (isAudioOnly) {
                            mediaProfile = format === 'mp4' ? MediaProfile.MP4_AUDIO_ONLY : MediaProfile.WEBM_AUDIO_ONLY;
                        } else {
                            mediaProfile = format === 'mp4' ? MediaProfile.MP4 : MediaProfile.WEBM;
                        }

                        // Configure session based on client preferences
                        const session = await recordingManager.createSession({
                            sessionId,
                            // Set appropriate media profile based on recording mode and format
                            mediaProfile,
                            quality: RecordingQuality.HIGH,
                            // Set recording mode based on client preference
                            recordingMode: data.audioOnly ? RecordingMode.AUDIO_ONLY : RecordingMode.AUDIO_VIDEO,
                            // Enable blue color blank screen on pause (for video recordings)
                            insertBlankScreenOnPause: !data.audioOnly,
                            blankScreenColor: '#0000FF' // Blue color
                        });

                        // Store session
                        sessions.set(sessionId, session);

                        // Send session ID back to client
                        ws.send(JSON.stringify({
                            action: 'ready',
                            sessionId,
                            isAudioOnly
                        }));
                    } catch (error: any) {
                        console.error('Error creating recording session:', error);
                        ws.send(JSON.stringify({
                            action: 'error',
                            message: error.message || 'Failed to create recording session'
                        }));
                    }
                    break;
                }

                case 'offer': {
                    const { sessionId, sdpOffer } = data;

                    // Get session
                    const session = sessions.get(sessionId);
                    if (!session) {
                        throw new Error(`Session ${sessionId} not found`);
                    }

                    // Process WebRTC offer
                    const sdpAnswer = await session.processOffer(sdpOffer);

                    // Ensure we're sending a proper SDP answer
                    let finalSdpAnswer;
                    if (typeof sdpAnswer === 'object' && sdpAnswer.sdp) {
                        // If we got an object with sdp property, send that
                        finalSdpAnswer = sdpAnswer.sdp;
                        console.log('Extracted SDP string from object');
                    } else {
                        // Otherwise, assume it's already an SDP string
                        finalSdpAnswer = sdpAnswer;
                        console.log('Using SDP answer as is');
                    }

                    // Send SDP answer back to client
                    ws.send(JSON.stringify({
                        action: 'answer',
                        sessionId,
                        sdpAnswer: finalSdpAnswer
                    }));

                    // Start recording
                    await session.start();

                    // Notify client that recording has started
                    ws.send(JSON.stringify({
                        action: 'recording',
                        sessionId,
                        state: 'started'
                    }));
                    break;
                }

                case 'candidate': {
                    const { sessionId, candidate } = data;

                    // Get session
                    const session = sessions.get(sessionId);
                    if (!session) {
                        throw new Error(`Session ${sessionId} not found`);
                    }

                    // Add ICE candidate
                    await session.addIceCandidate(candidate);
                    break;
                }

                case 'stop': {
                    const { sessionId } = data;

                    // Stop recording
                    const result = await recordingManager.stopSession(sessionId);

                    // Notify client that recording has stopped
                    ws.send(JSON.stringify({
                        action: 'recording',
                        sessionId,
                        state: 'stopped',
                        result
                    }));
                    break;
                }

                case 'pause': {
                    const { sessionId, pauseType } = data;

                    // Get session
                    const session = sessions.get(sessionId);
                    if (!session) {
                        throw new Error(`Session ${sessionId} not found`);
                    }

                    // Pause recording with specified pause type (default to both)
                    await session.pause(pauseType);

                    // Notify client that recording has paused
                    ws.send(JSON.stringify({
                        action: 'recording',
                        sessionId,
                        state: 'paused',
                        pauseType
                    }));
                    break;
                }

                case 'resume': {
                    const { sessionId, resumeType } = data;

                    // Get session
                    const session = sessions.get(sessionId);
                    if (!session) {
                        throw new Error(`Session ${sessionId} not found`);
                    }

                    // Resume recording with specified resume type
                    await session.resume(resumeType);

                    // Notify client that recording has resumed
                    ws.send(JSON.stringify({
                        action: 'recording',
                        sessionId,
                        state: 'resumed',
                        resumeType
                    }));
                    break;
                }

                default:
                    console.warn('Unknown action:', data.action);
            }
        } catch (error: any) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({
                action: 'error',
                message: error.message
            }));
        }
    });

    // Handle WebSocket disconnection
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    // Connect to Kurento on startup
    try {
        await recordingManager.connect();
        console.log('Connected to Kurento Media Server');
    } catch (error: any) {
        console.error('Failed to connect to Kurento Media Server:', error);
        console.log('Server will attempt to connect when first client connects');
    }
});

// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');

    try {
        // Stop all recordings and disconnect
        await recordingManager.disconnect();
        console.log('Clean shutdown completed');
    } catch (error: any) {
        console.error('Error during shutdown:', error);
    }

    process.exit(0);
});

// Helper function to generate a session ID
function generateSessionId(): string {
    return `session-${Date.now()}`;
} 