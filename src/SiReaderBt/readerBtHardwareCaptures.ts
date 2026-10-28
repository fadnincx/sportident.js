// Captured from a real Reader BT (serial 1000194, sireader 2.2.0, hardware 4.1) through
// Chrome's Web Bluetooth. Each export is the bytes of one BLE notification, as received.
// Unlike readerBtExamples.ts these are not derived from the spec.
//
// Only the owner data is altered: the text is replaced by a made-up person of the same
// block length, still CP850 encoded with umlauts, as the card stores it.

import { encodeCp850 } from '../utils/charset';

const hex = (text: string): number[] => text.split(' ').map((byte) => parseInt(byte, 16));

// The owner block as the reader sends it: character_set byte, CP850 text, NUL padding.
const ownerBlock = (text: string, length: number): number[] => {
	const block = [0x01, ...encodeCp850(text)];
	while (block.length < length + 1) {
		block.push(0x00);
	}
	return block;
};

// Settings characteristic

export const CAPTURED_DEVICE_INFO_NOTIFICATION = hex(
	'0e 01 74 00 02 43 0f 00 a7 00 04 01 ea 07 0a 0c ea 07 0a 0c 73 69 72 65 61 64 65 72 40 32 2e 32 2e 30 2b 37 31 66 38 39 66 66 2e 32 30 32 36 31 30 30 38 31 31 33 37 33 38 ' +
		Array(63).fill('00').join(' ')
);

export const CAPTURED_SETTINGS_NOTIFICATION = hex('0c 01 0a 00 05 00 05 00 00 00 00 00 00 00');

export const CAPTURED_AUTOSEND_OFF_NOTIFICATION = hex('10 01 01 00 00');
export const CAPTURED_AUTOSEND_ON_NOTIFICATION = hex('10 01 01 00 01');

// Card state characteristic

export const CAPTURED_SICARD9_INSERTED_NOTIFICATION = hex('01 11 07 00 63 53 12 00 01 05 00');
export const CAPTURED_SICARD9_REMOVED_NOTIFICATION = hex('01 11 07 00 63 53 12 00 00 05 00');
export const CAPTURED_SIAC_INSERTED_NOTIFICATION = hex('01 11 07 00 23 23 7d 00 01 05 00');

// Card data characteristic

export const ANONYMISED_SICARD9_OWNER = 'Hans;Müller;';

// SI-Card 9 1200995, complete readout: small enough for a single notification, so no
// 0xA101 wrapper. Records: clear, check, start, finish, then one control.
export const CAPTURED_SICARD9_COMPLETE_NOTIFICATION = [
	...hex(
		'03 11 48 00 63 53 12 00 01 05 00 00 01 01 00 48 c4 07 00 00 02 01 00 48 c4 07 00 00 03 04 00 b0 71 0b 00 00 05 06 00 b0 09 46 00 00 07 1f 00 18 9c 0f 00'
	),
	...ownerBlock(ANONYMISED_SICARD9_OWNER, 24)
];

export const ANONYMISED_SIAC_OWNER = 'Hans;Müller;M;01.01.1990;OL Zürich;hans@example.com;+41000000000;Bäch;Seestrasse 1;8806;CH;';

// SIAC 8200995, complete readout of 30 records, split by the reader into two 0xA101
// segments (flag First with the 393-byte total, then flag Last). The first holds only
// punch records and is unaltered.
export const CAPTURED_SIAC_COMPLETE_SEGMENT_FIRST = hex(
	'01 a1 f4 00 01 89 01 00 00 03 11 85 01 23 23 7d 00 0f 1e 00 07 01 fb 00 c0 f5 ab 02 34 05 00 00 73 fe f4 02 34 06 00 00 73 fe f4 02 32 07 47 00 cb 1d af 02 32 07 48 00 b2 b5 af 02 32 07 45 00 5b 8a b0 02 32 07 32 00 1d 26 b7 02 32 07 2f 00 8e 2c bb 02 32 07 2e 00 86 0a bc 02 32 07 24 00 7b 2e c3 02 32 07 25 00 ce 81 c4 02 32 07 2a 00 ca 3e cd 02 32 07 2d 00 5d 75 cf 02 32 07 37 00 7e b1 d1 02 32 07 39 00 8f 5e d2 02 32 07 3a 00 93 23 d4 02 32 07 35 00 46 28 d5 02 32 07 33 00 81 38 d6 02 32 07 56 00 ff 8f db 02 32 07 5c 00 c2 f8 dd 02 32 07 5b 00 6d b2 de 02 32 07 58 00 a3 1c e1 02 32 07 5e 00 0f 5c e4 02 32 07 63 00 7a a7 e5 02 32 07 7d 00 77 97 ec 02 32 07 81 00 e9 7f ef 02 32 07 82 00 1d 43 f0 02 32 07 7f 00 44 a2 f1 02 32 07 7a 00'
);

export const CAPTURED_SIAC_COMPLETE_SEGMENT_LAST = [
	...hex('01 a1 9b 00 02'),
	// rest of the last punch record, then the final one
	...hex('f8 bb f3 02 32 07 4b 00 88 6c f4 02'),
	// SIAC production data: HW 1.6, SW 4.3, 5069 signals, 203 clears, 2890 mV,
	// battery 2021-06-02, produced 2021-06
	...hex('10 2b cd 13 cb 00 4a 0b 15 06 02 15 06'),
	...ownerBlock(ANONYMISED_SIAC_OWNER, 128)
];

// Minimal readouts (0x1102): the same records without the SIAC block or owner data. The
// SIAC one is still segmented and took as long as the complete one (991 ms).
export const CAPTURED_SICARD9_MINIMAL_NOTIFICATION = hex(
	'02 11 2f 00 63 53 12 00 01 05 00 00 01 01 00 48 c4 07 00 00 02 01 00 48 c4 07 00 00 03 04 00 b0 71 0b 00 00 05 06 00 b0 09 46 00 00 07 1f 00 18 9c 0f 00'
);

export const CAPTURED_SIAC_MINIMAL_SEGMENT_FIRST = [
	...hex('01 a1 f4 00 01 fb 00 00 00 02 11 f7 00'),
	...CAPTURED_SIAC_COMPLETE_SEGMENT_FIRST.slice(13)
];
export const CAPTURED_SIAC_MINIMAL_SEGMENT_LAST = hex('01 a1 0d 00 02 f8 bb f3 02 32 07 4b 00 88 6c f4 02');

// Sessions (0x3103): two pages of five, newest first. This reader has no wall clock, so
// every start and end time is 0; numberOfRecords counts card readouts.
export const CAPTURED_SESSIONS_PAGE_0_NOTIFICATION = hex(
	'03 31 67 00 00 02 05 0a 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 09 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03 00 08 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 07 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 02 00 06 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00'
);
export const CAPTURED_SESSIONS_PAGE_1_NOTIFICATION = hex(
	'03 31 67 00 01 02 05 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00'
);

// Session data (0x3104): an 8-byte header (session 3, 1 readout, 169 bytes), then the
// readout itself as a complete 0x1103 message, in one notification. The card is a SIAC
// with SPORTident's own test owner data, so nothing is altered.
export const CAPTURED_SESSION_3_NOTIFICATION = hex(
	'04 31 08 00 03 00 01 00 a9 00 00 00 03 11 a5 00 a6 6c 85 00 0f 02 00 07 01 01 00 58 ad 0b 08 02 07 1f 00 50 55 0c 08 4b 31 44 00 03 00 a4 0b 19 0a 11 19 0a 01 53 50 4f 52 54 69 64 65 6e 74 3b 54 65 73 74 6c 6f 73 3b 3b 3b 3b 3b 3b 3b 3b 3b 3b ' +
		Array(100).fill('00').join(' ')
);

// The complete SIAC readout message above, as one byte run.
const SIAC_COMPLETE_MESSAGE = [...CAPTURED_SIAC_COMPLETE_SEGMENT_FIRST.slice(9), ...CAPTURED_SIAC_COMPLETE_SEGMENT_LAST.slice(5)];

// Session 10: the header and the SIAC readout above in one 405-byte segmented transfer.
// The first segment is unaltered; the last carries the anonymised owner data.
export const CAPTURED_SESSION_10_SEGMENT_FIRST = [
	...hex('01 a1 f4 00 01 95 01 00 00 04 31 08 00 0a 00 01 00 89 01 00 00'),
	...SIAC_COMPLETE_MESSAGE.slice(0, 227)
];
export const CAPTURED_SESSION_10_SEGMENT_LAST = [...hex('01 a1 a7 00 02'), ...SIAC_COMPLETE_MESSAGE.slice(227)];
