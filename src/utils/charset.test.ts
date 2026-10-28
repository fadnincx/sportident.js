import { describe, expect, test } from '@jest/globals';
import { CP850_REPLACEMENT_BYTE, decodeCp850, encodeCp850 } from './charset';

describe('charset utils', () => {
	test('the table covers exactly 0x80-0xFF', () => {
		const high = Array.from({ length: 0x80 }, (_, index) => 0x80 + index);
		const decoded = decodeCp850(high);
		expect(decoded.length).toBe(0x80);
		expect(new Set(decoded.split('')).size).toBe(0x80);
	});

	test('decodes ASCII unchanged', () => {
		expect(decodeCp850([0x48, 0x61, 0x6e, 0x73, 0x3b])).toBe('Hans;');
	});

	test('decodes the umlauts as captured from a real card', () => {
		// "Würsten" and "Hofstättli" as read from a SIAC through a Reader BT
		expect(decodeCp850([0x57, 0x81, 0x72])).toBe('Wür');
		expect(decodeCp850([0x73, 0x74, 0x84, 0x74])).toBe('stät');
	});

	test('decodes the other Western European letters', () => {
		expect(decodeCp850([0x82, 0x8a, 0x85, 0x94, 0x9a, 0x8e, 0x99, 0x9b, 0x9d, 0xe1, 0x87, 0x90, 0xb7])).toBe('éèàöÜÄÖøØßçÉÀ');
	});

	test('encodes and round-trips', () => {
		const text = 'Jörg;Müller;Zürich;Øyvind;Façade';
		expect(decodeCp850(encodeCp850(text))).toBe(text);
		expect(encodeCp850('ü')).toEqual([0x81]);
	});

	test('replaces characters CP850 cannot represent', () => {
		expect(encodeCp850('a€b')).toEqual([0x61, CP850_REPLACEMENT_BYTE, 0x62]);
	});
});
