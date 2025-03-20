/**
 * ConfigManager for validating and normalizing configurations
 */

import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
    RecordingManagerConfig,
    RecordingSessionOptions,
    MediaProfile,
    RecordingQuality,
    RecordingMode,
    ShareType
} from '../types';
import { ConfigError } from '../errors';
import {
    DEFAULT_MANAGER_CONFIG,
    DEFAULT_SESSION_OPTIONS,
    DEFAULT_QUALITY_SETTINGS,
    MEDIA_PROFILE_EXTENSIONS,
    RECORDING_MODE_PROFILES,
    ErrorCode
} from '../constants';
import { Logger } from './Logger';

/**
 * Configuration Manager class
 * Handles validation and normalization of configuration options
 */
export class ConfigManager {
    private logger: Logger;
    private static instance: ConfigManager;

    /**
     * Get singleton instance
     */
    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            throw new Error('ConfigManager not initialized. Create an instance first.');
        }
        return ConfigManager.instance;
    }

    /**
     * Create a new ConfigManager
     */
    constructor(logger: Logger) {
        this.logger = logger;
        ConfigManager.instance = this;
    }

    /**
     * Validate and normalize recording manager configuration
     * 
     * @param config User-provided configuration
     * @returns Normalized configuration
     */
    validateManagerConfig(config: RecordingManagerConfig): Required<RecordingManagerConfig> {
        this.logger.debug('Validating manager configuration');

        if (!config.kurentoUrl) {
            throw new ConfigError(
                'Kurento WebSocket URL is required',
                ErrorCode.CONFIG_ERROR
            );
        }

        // Apply default values and normalize
        const normalized: Required<RecordingManagerConfig> = {
            kurentoUrl: config.kurentoUrl,
            reconnectAttempts: config.reconnectAttempts ?? DEFAULT_MANAGER_CONFIG.reconnectAttempts,
            reconnectInterval: config.reconnectInterval ?? DEFAULT_MANAGER_CONFIG.reconnectInterval,
            logLevel: config.logLevel ?? DEFAULT_MANAGER_CONFIG.logLevel,
            tempDir: config.tempDir ?? DEFAULT_MANAGER_CONFIG.tempDir,
            logger: config.logger ?? undefined,
            preservePipelinesOnDisconnect: config.preservePipelinesOnDisconnect ?? DEFAULT_MANAGER_CONFIG.preservePipelinesOnDisconnect,
            maxReconnectionTimeMs: config.maxReconnectionTimeMs ?? DEFAULT_MANAGER_CONFIG.maxReconnectionTimeMs
        };

        // Validate reconnect attempts
        if (normalized.reconnectAttempts < 0) {
            this.logger.warn('Negative reconnect attempts provided, setting to 0');
            normalized.reconnectAttempts = 0;
        }

        // Validate reconnect interval
        if (normalized.reconnectInterval < 100) {
            this.logger.warn('Reconnect interval too low, setting to 1000ms');
            normalized.reconnectInterval = 1000;
        }

        return normalized;
    }

    /**
     * Validate and normalize recording session options
     * 
     * @param options User-provided session options
     * @param tempDir Base temporary directory from manager config
     * @returns Normalized session options
     */
    validateSessionOptions(
        options: RecordingSessionOptions,
        tempDir: string
    ): Required<RecordingSessionOptions> {
        this.logger.debug('Validating session options', options);

        // Generate session ID if not provided
        const sessionId = options.sessionId || uuidv4();

        // Get recording mode
        const recordingMode = options.recordingMode || DEFAULT_SESSION_OPTIONS.recordingMode;

        // Select media profile based on recording mode if not provided
        let mediaProfile = options.mediaProfile;
        if (!mediaProfile) {
            mediaProfile = RECORDING_MODE_PROFILES[recordingMode];
            this.logger.debug(`Selected media profile ${mediaProfile} for recording mode ${recordingMode}`);
        }

        // Validate media profile matches recording mode
        this.validateMediaProfileForMode(mediaProfile, recordingMode);

        // Get file extension for the media profile
        const fileExtension = MEDIA_PROFILE_EXTENSIONS[mediaProfile];

        // Determine file path
        let filePath = options.filePath;
        if (!filePath) {
            filePath = path.join(tempDir, `recording_${sessionId}${fileExtension}`);
            this.logger.debug(`Generated file path: ${filePath}`);
        }

        // Get quality settings
        const quality = options.quality || DEFAULT_SESSION_OPTIONS.quality;
        const qualitySettings = DEFAULT_QUALITY_SETTINGS[quality];

        // Apply default values and normalize
        const normalized: Required<RecordingSessionOptions> = {
            sessionId,
            mediaProfile,
            quality,
            maxBitrate: options.maxBitrate ?? qualitySettings.maxBitrate,
            minBitrate: options.minBitrate ?? qualitySettings.minBitrate,
            recordingMode,
            hasAudio: options.hasAudio ??
                (recordingMode !== RecordingMode.VIDEO_ONLY && DEFAULT_SESSION_OPTIONS.hasAudio),
            width: options.width ?? 1920,
            height: options.height ?? 1080,
            frameRate: options.frameRate ?? qualitySettings.frameRate,
            shareType: options.shareType ?? ShareType.UNKNOWN,
            filePath,
            insertBlankScreenOnPause: options.insertBlankScreenOnPause ?? DEFAULT_SESSION_OPTIONS.insertBlankScreenOnPause,
            blankScreenColor: options.blankScreenColor ?? DEFAULT_SESSION_OPTIONS.blankScreenColor
        };

        // Ensure audio-only recording has audio enabled
        if (recordingMode === RecordingMode.AUDIO_ONLY && !normalized.hasAudio) {
            this.logger.warn('Audio-only recording mode selected but hasAudio is false, enabling audio');
            normalized.hasAudio = true;
        }

        // Ensure video-only recording has valid dimensions
        if (recordingMode === RecordingMode.VIDEO_ONLY &&
            (normalized.width <= 0 || normalized.height <= 0)) {
            throw new ConfigError(
                'Invalid video dimensions for video recording',
                ErrorCode.INVALID_PARAMETER,
                { width: normalized.width, height: normalized.height }
            );
        }

        // Ensure bitrate values are reasonable
        if (normalized.minBitrate <= 0) {
            this.logger.warn('Minimum bitrate must be positive, setting to default');
            normalized.minBitrate = qualitySettings.minBitrate;
        }

        if (normalized.maxBitrate <= 0) {
            this.logger.warn('Maximum bitrate must be positive, setting to default');
            normalized.maxBitrate = qualitySettings.maxBitrate;
        }

        if (normalized.minBitrate > normalized.maxBitrate) {
            this.logger.warn('Minimum bitrate greater than maximum, swapping values');
            const temp = normalized.minBitrate;
            normalized.minBitrate = normalized.maxBitrate;
            normalized.maxBitrate = temp;
        }

        return normalized;
    }

    /**
     * Validate that the selected media profile matches the recording mode
     * 
     * @param mediaProfile Selected media profile
     * @param recordingMode Recording mode
     */
    private validateMediaProfileForMode(mediaProfile: MediaProfile, recordingMode: RecordingMode): void {
        switch (recordingMode) {
            case RecordingMode.AUDIO_ONLY:
                if (![MediaProfile.WEBM_AUDIO_ONLY, MediaProfile.MP4_AUDIO_ONLY].includes(mediaProfile)) {
                    this.logger.warn(
                        `Media profile ${mediaProfile} may not be optimal for audio-only recording, ` +
                        `consider using WEBM_AUDIO_ONLY or MP4_AUDIO_ONLY`
                    );
                }
                break;

            case RecordingMode.VIDEO_ONLY:
                if (![MediaProfile.WEBM_VIDEO_ONLY, MediaProfile.MP4_VIDEO_ONLY].includes(mediaProfile)) {
                    this.logger.warn(
                        `Media profile ${mediaProfile} may not be optimal for video-only recording, ` +
                        `consider using WEBM_VIDEO_ONLY or MP4_VIDEO_ONLY`
                    );
                }
                break;

            case RecordingMode.AUDIO_VIDEO:
                if (![MediaProfile.WEBM, MediaProfile.MP4].includes(mediaProfile)) {
                    this.logger.warn(
                        `Media profile ${mediaProfile} may not be optimal for audio+video recording, ` +
                        `consider using WEBM or MP4`
                    );
                }
                break;
        }
    }

    /**
     * Get a configuration value by path
     * @param path Dot-notation path to the config value
     * @param defaultValue Default value if not found
     */
    public get(path: string, defaultValue: any = undefined): any {
        // Default values for common settings
        const defaults: Record<string, any> = {
            'connection.reconnectBaseDelay': 1000,
            'connection.reconnectMaxDelay': 30000
        };

        return defaultValue !== undefined ? defaultValue : defaults[path];
    }
} 