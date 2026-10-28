import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import { siStringToUtf8 } from './siStringEncoding';

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

describe('siStringToUtf8', () => {
	test('decodes ASCII, including a plain hyphen', () => {
		expect([0x48, 0x2d, 0x50].map(siStringToUtf8).join('')).toBe('H-P');
	});
	test('decodes card text as CP850', () => {
		expect([0x57, 0x81, 0x72, 0x73, 0x74, 0x65, 0x6e].map(siStringToUtf8).join('')).toBe('Würsten');
		expect(siStringToUtf8(0x9b)).toBe('ø');
		expect(siStringToUtf8(0xb7)).toBe('À');
	});
	test('drops control characters, DEL and out-of-range values', () => {
		expect(siStringToUtf8(0x00)).toBe('');
		expect(siStringToUtf8(0x0a)).toBe('');
		expect(siStringToUtf8(0x7f)).toBe('');
		expect(siStringToUtf8(0x100)).toBe('');
	});
});
