/**
 * Simple, focused logging infrastructure for SportIdent.js
 * Optimized for hardware interface debugging and protocol validation
 */

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}

export interface ILogger {
    error(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
}

/**
 * Lightweight logger optimized for browser-based hardware debugging
 */
class Logger implements ILogger {
    constructor(
        private readonly context: string,
        private level: LogLevel = LogLevel.INFO
    ) {}

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }

    error(message: string, ...args: unknown[]): void {
        if (this.level >= LogLevel.ERROR) {
            // eslint-disable-next-line no-console
            console.error(`[${this.context}] ${message}`, ...args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this.level >= LogLevel.WARN) {
            // eslint-disable-next-line no-console
            console.warn(`[${this.context}] ${message}`, ...args);
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this.level >= LogLevel.INFO) {
            // eslint-disable-next-line no-console
            console.info(`[${this.context}] ${message}`, ...args);
        }
    }

    debug(message: string, ...args: unknown[]): void {
        if (this.level >= LogLevel.DEBUG) {
            // eslint-disable-next-line no-console
            console.debug(`[${this.context}] ${message}`, ...args);
        }
    }
}

// Global state for logger factory
let defaultLevel: LogLevel = LogLevel.INFO;
const loggers = new Map<string, ILogger>();

/**
 * Simple factory for managing logger instances
 */
class LoggerFactory {
    static setDefaultLevel(level: LogLevel): void {
        defaultLevel = level;
        // Update existing loggers
        for (const logger of loggers.values()) {
            logger.setLevel(level);
        }
    }

    static getDefaultLevel(): LogLevel {
        return defaultLevel;
    }

    static getLogger(context: string): ILogger {
        if (!loggers.has(context)) {
            loggers.set(context, new Logger(context, defaultLevel));
        }
        return loggers.get(context)!;
    }

    static clearLoggers(): void {
        loggers.clear();
    }
}

// Export convenience functions
export const getLogger = LoggerFactory.getLogger;
export const setDefaultLogLevel = LoggerFactory.setDefaultLevel;
export const getDefaultLogLevel = LoggerFactory.getDefaultLevel;
export const clearLoggers = LoggerFactory.clearLoggers;

// Export for testing
export { Logger, LoggerFactory };

// Utility functions for common patterns
export const parseLogLevel = (value: string): LogLevel | undefined => {
    switch (value.toUpperCase()) {
        case 'ERROR': return LogLevel.ERROR;
        case 'WARN': return LogLevel.WARN;
        case 'INFO': return LogLevel.INFO;
        case 'DEBUG': return LogLevel.DEBUG;
        default: return undefined;
    }
};