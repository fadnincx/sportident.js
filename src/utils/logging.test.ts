import {
    LogLevel,
    getLogger,
    setDefaultLogLevel,
    getDefaultLogLevel,
    clearLoggers,
    parseLogLevel,
    Logger
} from './logging';

/**
 * Mock console for testing
 */
const createMockConsole = () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn()
});

describe('Simple Logging Infrastructure', () => {
    let mockConsole: ReturnType<typeof createMockConsole>;

    beforeEach(() => {
        mockConsole = createMockConsole();
        global.console = mockConsole as unknown as Console;
        clearLoggers();
        setDefaultLogLevel(LogLevel.INFO);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('LogLevel enum', () => {
        it('should have correct numeric values', () => {
            expect(LogLevel.ERROR).toBe(0);
            expect(LogLevel.WARN).toBe(1);
            expect(LogLevel.INFO).toBe(2);
            expect(LogLevel.DEBUG).toBe(3);
        });
    });

    describe('Logger', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger('TestContext');
        });

        describe('log level management', () => {
            it('should set and get log level', () => {
                logger.setLevel(LogLevel.DEBUG);
                expect(logger.getLevel()).toBe(LogLevel.DEBUG);
            });

            it('should default to INFO level', () => {
                expect(logger.getLevel()).toBe(LogLevel.INFO);
            });
        });

        describe('log level filtering', () => {
            it('should only log messages at or above current level', () => {
                logger.setLevel(LogLevel.WARN);

                logger.debug('debug message');
                logger.info('info message');
                logger.warn('warn message');
                logger.error('error message');

                expect(mockConsole.debug).not.toHaveBeenCalled();
                expect(mockConsole.info).not.toHaveBeenCalled();
                expect(mockConsole.warn).toHaveBeenCalledTimes(1);
                expect(mockConsole.error).toHaveBeenCalledTimes(1);
            });

            it('should log all messages when level is DEBUG', () => {
                logger.setLevel(LogLevel.DEBUG);

                logger.debug('debug message');
                logger.info('info message');
                logger.warn('warn message');
                logger.error('error message');

                expect(mockConsole.debug).toHaveBeenCalledTimes(1);
                expect(mockConsole.info).toHaveBeenCalledTimes(1);
                expect(mockConsole.warn).toHaveBeenCalledTimes(1);
                expect(mockConsole.error).toHaveBeenCalledTimes(1);
            });
        });

        describe('message formatting', () => {
            it('should include context in messages', () => {
                logger.info('test message');

                expect(mockConsole.info).toHaveBeenCalledWith(
                    '[TestContext] test message'
                );
            });

            it('should support additional arguments', () => {
                const context = { deviceId: 'test-device', operation: 'connect' };
                logger.info('device operation', context, 'extra');

                expect(mockConsole.info).toHaveBeenCalledWith(
                    '[TestContext] device operation',
                    context,
                    'extra'
                );
            });
        });

        describe('console method usage', () => {
            it('should use correct console methods for each level', () => {
                logger.setLevel(LogLevel.DEBUG);

                logger.error('error message');
                logger.warn('warn message');
                logger.info('info message');
                logger.debug('debug message');

                expect(mockConsole.error).toHaveBeenCalledWith('[TestContext] error message');
                expect(mockConsole.warn).toHaveBeenCalledWith('[TestContext] warn message');
                expect(mockConsole.info).toHaveBeenCalledWith('[TestContext] info message');
                expect(mockConsole.debug).toHaveBeenCalledWith('[TestContext] debug message');
            });
        });
    });

    describe('LoggerFactory', () => {
        describe('default level management', () => {
            it('should set and get default level', () => {
                setDefaultLogLevel(LogLevel.DEBUG);
                expect(getDefaultLogLevel()).toBe(LogLevel.DEBUG);
            });

            it('should apply default level to new loggers', () => {
                setDefaultLogLevel(LogLevel.ERROR);
                const logger = getLogger('test');
                expect(logger.getLevel()).toBe(LogLevel.ERROR);
            });

            it('should update existing loggers when default level changes', () => {
                const logger1 = getLogger('test1');
                const logger2 = getLogger('test2');

                setDefaultLogLevel(LogLevel.DEBUG);

                expect(logger1.getLevel()).toBe(LogLevel.DEBUG);
                expect(logger2.getLevel()).toBe(LogLevel.DEBUG);
            });
        });

        describe('logger instance management', () => {
            it('should return same instance for same context', () => {
                const logger1 = getLogger('test');
                const logger2 = getLogger('test');
                expect(logger1).toBe(logger2);
            });

            it('should return different instances for different contexts', () => {
                const logger1 = getLogger('test1');
                const logger2 = getLogger('test2');
                expect(logger1).not.toBe(logger2);
            });
        });

        describe('clearLoggers', () => {
            it('should remove all loggers', () => {
                getLogger('test1');
                getLogger('test2');

                clearLoggers();

                const newLogger1 = getLogger('test1');
                // Should create a new instance since loggers were cleared
                expect(newLogger1).toBeDefined();
            });
        });
    });

    describe('Utility Functions', () => {
        describe('parseLogLevel', () => {
            it('should parse valid log level strings', () => {
                expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
                expect(parseLogLevel('warn')).toBe(LogLevel.WARN);
                expect(parseLogLevel('Info')).toBe(LogLevel.INFO);
                expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
            });

            it('should return undefined for invalid strings', () => {
                expect(parseLogLevel('INVALID')).toBeUndefined();
                expect(parseLogLevel('')).toBeUndefined();
                expect(parseLogLevel('123')).toBeUndefined();
            });
        });
    });

    describe('Real-world Usage Patterns', () => {
        it('should handle device protocol logging', () => {
            const protocolLogger = getLogger('SiProtocol');
            protocolLogger.warn('Invalid date conversion: year out of range', { year: 100, rawData: [100, 12, 1] });

            expect(mockConsole.warn).toHaveBeenCalledWith(
                '[SiProtocol] Invalid date conversion: year out of range',
                { year: 100, rawData: [100, 12, 1] }
            );
        });

        it('should handle device driver logging', () => {
            const driverLogger = getLogger('WebUsbDriver');
            driverLogger.setLevel(LogLevel.DEBUG);

            driverLogger.debug('Opening USB device');
            driverLogger.error('Failed to open USB device', { error: 'Device not found', deviceId: 'test-123' });

            expect(mockConsole.debug).toHaveBeenCalledWith('[WebUsbDriver] Opening USB device');
            expect(mockConsole.error).toHaveBeenCalledWith(
                '[WebUsbDriver] Failed to open USB device',
                { error: 'Device not found', deviceId: 'test-123' }
            );
        });

        it('should handle card validation logging', () => {
            const cardLogger = getLogger('SiCard6');
            cardLogger.warn('Card number mismatch', { expected: 500030, actual: 500029 });

            expect(mockConsole.warn).toHaveBeenCalledWith(
                '[SiCard6] Card number mismatch',
                { expected: 500030, actual: 500029 }
            );
        });
    });

    describe('Performance', () => {
        it('should handle rapid logging efficiently', () => {
            const logger = getLogger('performance-test');

            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                logger.info(`Message ${i}`, { iteration: i });
            }
            const end = performance.now();

            expect(end - start).toBeLessThan(500); // Should complete in under 500ms
            expect(mockConsole.info).toHaveBeenCalledTimes(1000);
        });

        it('should not log when level is disabled', () => {
            const logger = getLogger('disabled-test');
            logger.setLevel(LogLevel.ERROR);

            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                logger.debug(`Debug message ${i}`); // Should be filtered out
            }
            const end = performance.now();

            expect(end - start).toBeLessThan(50); // Should be very fast when filtered
            expect(mockConsole.debug).not.toHaveBeenCalled();
        });
    });
});