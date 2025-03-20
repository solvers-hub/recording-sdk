/**
 * Default configuration values for the Recording SDK
 */

import {
    QualityParams,
    RecordingQuality,
    MediaProfile,
    LogLevel,
    RecordingMode
} from '../types';
import * as os from 'os';
import * as path from 'path';

/**
 * Default recording manager configuration
 */
export const DEFAULT_MANAGER_CONFIG = {
    reconnectAttempts: 5,
    reconnectInterval: 2000,
    logLevel: LogLevel.INFO,
    tempDir: path.join(os.tmpdir(), 'recordings'),
    preservePipelinesOnDisconnect: false,
    maxReconnectionTimeMs: 30000 // 30 seconds
};

/**
 * Default quality preset parameters
 */
export const DEFAULT_QUALITY_SETTINGS: Record<RecordingQuality, QualityParams> = {
    [RecordingQuality.LOW]: {
        maxBitrate: 1000,
        minBitrate: 200,
        frameRate: 15,
        qualityLevel: 7
    },
    [RecordingQuality.MEDIUM]: {
        maxBitrate: 2000,
        minBitrate: 500,
        frameRate: 24,
        qualityLevel: 5
    },
    [RecordingQuality.HIGH]: {
        maxBitrate: 4000,
        minBitrate: 1000,
        frameRate: 30,
        qualityLevel: 3
    },
    [RecordingQuality.ULTRA]: {
        maxBitrate: 8000,
        minBitrate: 2000,
        frameRate: 60,
        qualityLevel: 1
    }
};

/**
 * Default recording session options
 */
export const DEFAULT_SESSION_OPTIONS = {
    mediaProfile: MediaProfile.WEBM,
    quality: RecordingQuality.HIGH,
    recordingMode: RecordingMode.AUDIO_VIDEO,
    hasAudio: true,
    insertBlankScreenOnPause: true,
    blankScreenColor: 'black'
};

/**
 * Default WebRTC endpoint options
 */
export const DEFAULT_WEBRTC_OPTIONS = {
    useIpv6: false,
    mediaConstraints: {
        audio: true,
        video: true
    }
};

/**
 * Default recorder endpoint options
 */
export const DEFAULT_RECORDER_OPTIONS = {
    stopOnEndOfStream: true,
    quality: 9 // High quality (0-10)
};

/**
 * Media profile file extensions mapping
 */
export const MEDIA_PROFILE_EXTENSIONS: Record<MediaProfile, string> = {
    [MediaProfile.WEBM]: '.webm',
    [MediaProfile.WEBM_VIDEO_ONLY]: '.webm',
    [MediaProfile.WEBM_AUDIO_ONLY]: '.webm',
    [MediaProfile.MP4]: '.mp4',
    [MediaProfile.MP4_VIDEO_ONLY]: '.mp4',
    [MediaProfile.MP4_AUDIO_ONLY]: '.mp4',
};

/**
 * Recording mode to media profile mapping (default recommendations)
 */
export const RECORDING_MODE_PROFILES: Record<RecordingMode, MediaProfile> = {
    [RecordingMode.AUDIO_VIDEO]: MediaProfile.WEBM,
    [RecordingMode.AUDIO_ONLY]: MediaProfile.WEBM_AUDIO_ONLY,
    [RecordingMode.VIDEO_ONLY]: MediaProfile.WEBM_VIDEO_ONLY
}; 