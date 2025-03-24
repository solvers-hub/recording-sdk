# Recording SDK

A TypeScript SDK for simplified WebRTC recording using Kurento Media Server.

## Overview

This SDK provides a simple interface for recording WebRTC streams using Kurento Media Server. It abstracts the complexity of WebRTC and Kurento, allowing developers to focus on their application logic rather than the underlying media technology.

## Requirements

- Node.js 14 or higher
- Kurento Media Server 6.16 or higher (7.0+ recommended)

### Setting up Kurento Media Server

The easiest way to set up Kurento is using Docker:

```bash
# For Linux
docker run -d --name kurento -p 8888:8888 \
  -e GST_DEBUG=Kurento*:5 \
  -e KMS_ICE_TCP=1 \
  kurento/kurento-media-server:7.1.0

# For Windows/Mac (requires additional port forwarding for WebRTC)
docker run -d --name kurento -p 8888:8888 \
  -e GST_DEBUG=Kurento*:5 \
  -e KMS_ICE_TCP=1 \
  -p 5000-5050:5000-5050/udp \
  -p 5000-5050:5000-5050/tcp \
  kurento/kurento-media-server:7.1.0
```

#### Accessing Recordings

When using Kurento in Docker, recordings are stored inside the container. You can:

1. **Mount a volume** to access recordings directly in your host OS:

```bash
# Mount a local directory to the container's /recordings directory
docker run -d --name kurento -p 8888:8888 \
  -e GST_DEBUG=Kurento*:5 \
  -e KMS_ICE_TCP=1 \
  -v /path/on/your/host:/recordings \
  kurento/kurento-media-server:7.1.0
```

In your RecordingManager configuration, set `tempDir` to `/recordings` or another path that you've mounted:

```typescript
const recordingManager = new RecordingManager({
  kurentoUrl: 'ws://localhost:8888/kurento',
  tempDir: '/recordings'  // This path is inside the container
});
```

2. **Download recordings** from the container after they're created:

```bash
# List recordings in the container
docker exec kurento ls -la /tmp

# Copy a recording from the container to the host
docker cp kurento:/tmp/your-recording.webm ./your-recording.webm
```

For more installation options, see the [Kurento installation guide](https://doc-kurento.readthedocs.io/en/latest/user/installation.html#docker-image).

## Features

- Simple API for recording WebRTC streams
- TypeScript support with full type definitions
- Event-based architecture
- Configurable recording options (quality, format, etc.)
- Robust error handling
- Reconnection support
- Client-side and server-side examples
- Support for custom loggers (Winston, Pino, etc.)

## Installation

```bash
npm install recording-sdk
```

## Basic Usage

### Server-side

```typescript
import { RecordingManager } from 'recording-sdk';

// Create a recording manager
const recordingManager = new RecordingManager({
  kurentoUrl: 'ws://your-kurento-server:8888/kurento',
  reconnectAttempts: 5,
  logLevel: 'info'
});

// Connect to Kurento Media Server
await recordingManager.connect();

// Create a recording session
const session = await recordingManager.createSession({
  sessionId: 'unique-session-id',
  mediaProfile: 'WEBM',
  quality: 'HIGH'
});

// Process an SDP offer from a client
const sdpAnswer = await session.processOffer(sdpOfferFromClient);

// Send the SDP answer back to the client

// Start recording
await session.start();

// Later, stop recording
const result = await session.stop();
console.log(`Recording saved to: ${result.filePath}`);
```

### Client-side

```javascript
// Create a WebRTC connection
const pc = new RTCPeerConnection();

// Add media tracks
navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  .then(stream => {
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    
    // Create an offer
    return pc.createOffer();
  })
  .then(offer => {
    pc.setLocalDescription(offer);
    
    // Send the offer to your server
    return fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdpOffer: offer.sdp })
    });
  })
  .then(response => response.json())
  .then(data => {
    // Set the SDP answer from the server
    pc.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: data.sdpAnswer
    }));
  })
  .catch(error => console.error('Error:', error));
```

## Advanced Usage

### Event Handling

The SDK uses an event-based architecture for notifications:

```typescript
recordingManager.on('connected', () => {
  console.log('Connected to Kurento Media Server');
});

recordingManager.on('disconnected', () => {
  console.log('Disconnected from Kurento Media Server');
});

session.on('started', () => {
  console.log('Recording started');
});

session.on('stopped', (result) => {
  console.log(`Recording stopped: ${result.filePath}`);
});

session.on('error', (error) => {
  console.error('Recording error:', error);
});
```

### Custom Configuration

```typescript
const session = await recordingManager.createSession({
  sessionId: 'unique-session-id',
  mediaProfile: 'WEBM',
  quality: 'HIGH',
  recordingMode: 'AUDIO_VIDEO',
  outputPath: '/recordings',
  filename: 'my-recording.webm',
  metadata: {
    userId: '123',
    meetingId: '456'
  }
});
```

### Using a Custom Logger

The SDK supports using your own logger (Winston, Pino, Bunyan, etc.) instead of the built-in Pino logger:

```typescript
import { RecordingManager, ILogger } from 'recording-sdk';
import winston from 'winston';

// Create your Winston logger
const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.colorize()
    }),
    new winston.transports.File({ filename: 'kurento-recording.log' })
  ]
});

// Create an adapter that implements the ILogger interface
const loggerAdapter: ILogger = {
  error: (message, context) => winstonLogger.error(message, context),
  warn: (message, context) => winstonLogger.warn(message, context),
  info: (message, context) => winstonLogger.info(message, context),
  debug: (message, context) => winstonLogger.debug(message, context),
  trace: (message, context) => winstonLogger.verbose(message, context),
  // Optional: implement setLevel if you want to support changing log levels
  setLevel: (level) => { winstonLogger.level = level; }
};

// Initialize RecordingManager with your logger
const recordingManager = new RecordingManager({
  kurentoUrl: 'ws://localhost:8888/kurento',
  // Pass your custom logger
  logger: loggerAdapter
});
```

## Examples

See the `examples` directory for complete examples of how to use the SDK:

- `basic-server.ts`: A basic Express server that handles WebRTC signaling and recording
- `basic-client.html`: A simple web client that streams camera and microphone data
- `basic-usage.ts`: Example showing programmatic usage of the SDK
- `custom-logger.ts`: Example showing how to use a custom logger with the SDK

## API Reference

### `RecordingManager`

Main entry point for the SDK. Manages connections to Kurento and recording sessions.

#### Methods

- `connect()`: Connect to Kurento Media Server
- `disconnect()`: Disconnect from Kurento Media Server
- `createSession(options)`: Create a new recording session
- `getSession(sessionId)`: Get an existing session by ID
- `stopSession(sessionId)`: Stop a recording session
- `on(event, callback)`: Register an event listener

### `RecordingSession`

Represents a recording session for a WebRTC stream.

#### Methods

- `processOffer(sdpOffer)`: Process an SDP offer and return an SDP answer
- `addIceCandidate(candidate)`: Add an ICE candidate
- `start()`: Start recording
- `stop()`: Stop recording
- `pause()`: Pause recording (if supported)
- `resume()`: Resume recording (if supported)
- `getState()`: Get the current state of the recording
- `getOptions()`: Get the recording options
- `getFilePath()`: Get the file path of the recording
- `on(event, callback)`: Register an event listener

## Extensibility & Future Plans

The Recording SDK is designed to be extensible and scalable, with the goal of supporting additional Kurento features beyond basic session recording.

### Filters & Media Processing

Kurento Media Server supports various media processing filters that can be applied to the media pipeline. Future versions of this SDK will provide an easy-to-use interface for these filters:

- **Chroma Filter** - Replace background with an image
- **Crowd Detector** - Detect crowds, occupancy, and fluidity
- **Plate Detector** - Recognize vehicle license plates
- **Pointer Detector** - Detect pointers in a video stream

### Planned Recording Modes

While the current SDK focuses on session recording, the architecture is designed to be extended to support other Kurento use cases:

- One-to-one video calls with recording
- One-to-many broadcasting
- Many-to-many video conferencing (group calls)
- Media players and media elements
- WebRTC data channels
- Advanced media statistics and analytics

### Architecture

The SDK uses a modular architecture to facilitate future extensions:

1. **Core Components** - Base infrastructure for WebRTC and Kurento interactions
2. **Media Pipelines** - Configurable pipeline construction for different use cases
3. **Filter System** - Pluggable processing filters for media manipulation
4. **Session Types** - Different session implementations for various recording modes

Contributions and feedback on extending the SDK to support these features are welcome.

## License

MIT

## Documentation

The SDK comes with comprehensive documentation to help you understand and use all available features. You can access the documentation in the following ways:

### HTML Documentation

Run the following command to generate HTML documentation:

```bash
npm run docs
```

This will generate documentation in the `docs` directory. You can then open `docs/index.html` in your browser to view it.