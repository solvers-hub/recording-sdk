/**
 * Logger utility for Recording SDK
 */

import pino from 'pino';
import { LogLevel } from '../types';

/**
 * Logger interface that must be implemented by any logger
 */
export interface ILogger {
    error(message: string, context?: object): void;
    warn(message: string, context?: object): void;
    info(message: string, context?: object): void;
    debug(message: string, context?: object): void;
    trace(message: string, context?: object): void;
    setLevel?(level: string): void;
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
    /** Logging level */
    level?: LogLevel;
    /** Module name for this logger */
    name?: string;
    /** Whether to pretty-print logs (development only) */
    prettyPrint?: boolean;
    /** External logger instance to use instead of built-in Pino */
    externalLogger?: ILogger;
}

/**
 * Logging utility class
 */
export class Logger implements ILogger {
    private logger: pino.Logger | ILogger;
    private moduleName: string;
    private isExternalLogger: boolean;

    /**
     * Create a new logger instance
     * 
     * @param options Logger options
     */
    constructor(options: LoggerOptions | string = {}) {
        // Allow passing just a name as string for convenience
        const opts: LoggerOptions = typeof options === 'string'
            ? { name: options }
            : options;

        this.moduleName = opts.name || 'recordings';
        this.isExternalLogger = !!opts.externalLogger;

        if (opts.externalLogger) {
            this.logger = opts.externalLogger;
            return;
        }

        const pinoOptions: pino.LoggerOptions = {
            level: opts.level || LogLevel.INFO,
            name: this.moduleName,
        };

        // Add pretty printing for development if requested
        if (opts.prettyPrint) {
            pinoOptions.transport = {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                },
            };
        }

        this.logger = pino(pinoOptions);
    }

    /**
     * Log an error message
     * 
     * @param message Message to log
     * @param context Additional context object
     */
    error(message: string, context?: object): void {
        if (this.isExternalLogger) {
            (this.logger as ILogger).error(message, context || {});
        } else {
            (this.logger as pino.Logger).error(context || {}, message);
        }
    }

    /**
     * Log a warning message
     * 
     * @param message Message to log
     * @param context Additional context object
     */
    warn(message: string, context?: object): void {
        if (this.isExternalLogger) {
            (this.logger as ILogger).warn(message, context || {});
        } else {
            (this.logger as pino.Logger).warn(context || {}, message);
        }
    }

    /**
     * Log an info message
     * 
     * @param message Message to log
     * @param context Additional context object
     */
    info(message: string, context?: object): void {
        if (this.isExternalLogger) {
            (this.logger as ILogger).info(message, context || {});
        } else {
            (this.logger as pino.Logger).info(context || {}, message);
        }
    }

    /**
     * Log a debug message
     * 
     * @param message Message to log
     * @param context Additional context object
     */
    debug(message: string, context?: object): void {
        if (this.isExternalLogger) {
            (this.logger as ILogger).debug(message, context || {});
        } else {
            (this.logger as pino.Logger).debug(context || {}, message);
        }
    }

    /**
     * Log a trace message (most verbose level)
     * 
     * @param message Message to log
     * @param context Additional context object
     */
    trace(message: string, context?: object): void {
        if (this.isExternalLogger) {
            (this.logger as ILogger).trace(message, context || {});
        } else {
            (this.logger as pino.Logger).trace(context || {}, message);
        }
    }

    /**
     * Create a child logger with additional context
     * 
     * @param options Options for the child logger
     * @returns New logger instance
     */
    createChild(options: { name: string, context?: object }): Logger {
        const childName = `${this.moduleName}:${options.name}`;

        if (this.isExternalLogger) {
            // For external loggers, create a new Logger with the same external logger
            // but with a prefixed name in log messages
            const externalLogger: ILogger = {
                error: (message, context) => this.error(`[${options.name}] ${message}`, context),
                warn: (message, context) => this.warn(`[${options.name}] ${message}`, context),
                info: (message, context) => this.info(`[${options.name}] ${message}`, context),
                debug: (message, context) => this.debug(`[${options.name}] ${message}`, context),
                trace: (message, context) => this.trace(`[${options.name}] ${message}`, context),
            };
            return new Logger({ name: childName, externalLogger });
        }

        // Use standard Pino child logger for internal logger
        const child = new Logger({ name: childName });

        if (options.context) {
            // @ts-ignore - pino types are not fully compatible
            child.logger = (this.logger as pino.Logger).child(options.context);
        }

        return child;
    }

    /**
     * Set the logging level
     * 
     * @param level New logging level
     */
    setLevel(level: LogLevel): void {
        if (this.isExternalLogger) {
            const externalLogger = this.logger as ILogger;
            if (typeof externalLogger.setLevel === 'function') {
                externalLogger.setLevel(level);
            } else {
                // If the external logger doesn't support setLevel, log a warning
                // using our internal method to avoid infinite loops
                this.warn(`External logger does not support setLevel method`);
            }
        } else {
            (this.logger as pino.Logger).level = level;
        }
    }

    /**
     * Get the underlying logger instance
     * Could be Pino logger or external logger
     */
    getLoggerInstance(): pino.Logger | ILogger {
        return this.logger;
    }
} 