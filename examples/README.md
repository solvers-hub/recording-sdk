# Recording SDK Examples

This directory contains example implementations showing how to use the Recording SDK.

## Examples

- `basic-server.ts`: A basic Express server that handles WebRTC signaling and recording
- `basic-client.html`: A simple web client that streams camera and microphone data

## Development Note

These examples use direct imports from the source code (`../src`) for easier development and testing during SDK development. In a real application, you would import from the package:

```typescript
// Instead of:
import { RecordingManager } from '../src';

// Use:
import { RecordingManager } from 'recording-sdk';
```

## Future Extensions

The SDK is designed with extensibility in mind to support additional Kurento features beyond basic recording:

### Kurento Filters

Future versions will support these Kurento media processing filters:

- **Chroma Filter** - Replace backgrounds with custom images
- **Crowd Detector** - Detect and analyze crowds in video
- **Plate Detector** - Recognize vehicle license plates 
- **Pointer Detector** - Track pointers in video presentations

### Advanced Recording Modes

The architecture is being developed to support:

- One-to-one video calls with recording
- One-to-many broadcasting
- Many-to-many video conferencing
- WebRTC data channels
- Advanced media statistics

For developers interested in contributing to these extensions, the modular architecture makes it easier to add new functionality without disrupting existing features.

## Running the Examples

### Prerequisites

- Node.js 14 or higher
- Kurento Media Server (default: ws://localhost:8888/kurento)

#### Setting up Kurento Media Server

The SDK requires a running Kurento Media Server instance to work. The easiest way to set one up is using Docker:

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

> **Note:** Make sure to remove any control characters (like ^C) that might appear at the end of copied Docker commands.

These additional ports (5000-5050) are needed for WebRTC media streaming when running on Windows or Mac.

#### Accessing Recordings

The example server is configured to store recordings in `/recordings` inside the container. You have two options to access these files:

1. **Mount a volume** when starting Kurento to save recordings directly to your host OS:

```bash
# Mount a directory from your host to /recordings in the container
docker run -d --name kurento -p 8888:8888 \
  -e GST_DEBUG=Kurento*:5 \
  -e KMS_ICE_TCP=1 \
  -v /absolute/path/on/your/host:/recordings \
  kurento/kurento-media-server:7.1.0
```

Windows example:
```bash
docker run -d --name kurento -p 8888:8888 \
  -e GST_DEBUG=Kurento*:5 \
  -e KMS_ICE_TCP=1 \
  -v C:/Users/YourUsername/recordings:/recordings \
  -p 5000-5050:5000-5050/udp \
  -p 5000-5050:5000-5050/tcp \
  kurento/kurento-media-server:7.1.0
```

2. **Download recordings** after they've been created:

```bash
# List recordings in the container
docker exec kurento ls -la /recordings

# Copy a recording from the container to your current directory
docker cp kurento:/recordings/recording-filename.webm ./
```

When you run the example server, the `tempDir` is already set to `/recordings` in the RecordingManager configuration:

```typescript
const recordingManager = new RecordingManager({
    kurentoUrl: 'ws://localhost:8888/kurento',
    tempDir: '/recordings',  // This path is inside the container
    // ...
});
```

For more detailed installation options, see the [Kurento installation guide](https://doc-kurento.readthedocs.io/en/latest/user/installation.html#docker-image).

To verify that Kurento is running, you can check:
```bash
# Check container status
docker ps | grep kurento

# View logs
docker logs -f kurento
```

### Setup

The examples directory has its own package.json and tsconfig.json files, separate from the main SDK. This allows you to run the examples without affecting the SDK itself.

1. Navigate to the examples directory:
   ```bash
   cd examples
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Link the local SDK package (this is necessary since the examples import from '../src'):
   ```bash
   # From the root directory (one level up)
   cd ..
   npm link
   
   # Then in the examples directory
   cd examples
   npm link recording-sdk
   ```

### Running the Server

To start the example server:

```bash
npm start
```

Or use the development mode with auto-restart:

```bash
npm run dev
```

This will start the server on port 3000.

### Using the Client

1. With the server running, open `basic-client.html` in your browser:
   - You can open it directly from the file system
   - Or access it through the server at http://localhost:3000/basic-client.html

2. Follow the on-screen instructions to record audio/video.

## Modifying the Examples

Feel free to modify these examples to suit your needs. The configuration files in this directory are isolated from the main SDK, so your changes won't affect the SDK development.

## Troubleshooting

- Make sure Kurento Media Server is running and accessible
- Check the server console and browser console for error messages
- The default WebSocket URL for Kurento is ws://localhost:8888/kurento 