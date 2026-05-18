import * as utils from '../../utils';
import type { SiCardSample } from '../ISiCardExamples';

const cache = {};

const getNoTimesPage = utils.cached(cache, () =>
	utils.unPrettyHex(`
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
        EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
    `)
);

// TCard: cardNumber 6500000 = 0x632EA0
// SI bytes: 0x18=SI3=0x06, 0x19=SI2=0x63, 0x1A=SI1=0x2E, 0x1B=SI0=0xA0
//
// TCard control punch format (8 bytes per punch):
//   byte[0] = Code number (8-bit)
//   byte[1] = Station serial high
//   byte[2] = Station serial mid
//   byte[3] = Station serial low 2 bits | Year 4 bits | Month high 2 bits
//   byte[4] = Month low 2 bits | Day 5 bits | AM/PM bit 0
//   byte[5] = Time high (TH)
//   byte[6] = Time low (TL)
//   byte[7] = Subsecond
//
// SiTime reads [[byte+6], [byte+5], [byte+4]] where byte+4 bit 0 = AM/PM
// For time 8224 (AM, no PM addition): TH=0x20, TL=0x20, byte4 bit0=0
// For time 8481+43200 (PM): raw 12h = 8481, TH=0x21, TL=0x21, byte4 bit0=1
//
// byte[4] encodes: month_low(2) | day(5) | ampm(1)
// Example: month=5(May), day=15, ampm=0 -> 0b01_01111_0 = 0x5E
// Example: month=5(May), day=15, ampm=1 -> 0b01_01111_1 = 0x5F
//
// SiTime also reads weekday from byte[4] bits 1-3 and weekcounter from bits 4-5
// But TCard byte[4] bits 1-5 = day of month, bits 6-7 = month
// SiTime will interpret: weekday = (byte4 >> 1) & 0x07, weekcounter = (byte4 >> 4) & 0x03
// For byte4=0x5E (01_01111_0): weekday=(0x5E>>1)&7 = 0x2F&7 = 7, weekcounter=(0x5E>>4)&3 = 5&3 = 1
// For byte4=0x5F (01_01111_1): weekday=(0x5F>>1)&7 = 0x2F&7 = 7, weekcounter=(0x5F>>4)&3 = 5&3 = 1

export const getCardWith3Punches = utils.cached(cache, () => ({
	cardData: {
		uid: 0x11223344,
		cardNumber: 6500000,
		startTime: {time: 8721 + 43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time: 8735 + 43200, weekcounter: 3, weekday: 3},
		punchCount: 3,
		punches: [
			// Punch 0: code=31, time=8224 (AM), byte4=0x5E -> weekday=7, weekcounter=1
			{ code: 31, time: {time: 8224, weekcounter: 1, weekday: 7} },
			// Punch 1: code=32, time=8481+43200 (PM), byte4=0x5F -> weekday=7, weekcounter=1
			{ code: 32, time: {time: 8481 + 43200, weekcounter: 1, weekday: 7} },
			// Punch 2: code=33, time=8738 (AM), byte4=0x5E -> weekday=7, weekcounter=1
			{ code: 33, time: {time: 8738, weekcounter: 1, weekday: 7} },
		],
		cardHolder: {
			firstName: 'a',
			lastName: 'b',
			isComplete: true
		}
	},
	storageData: [
		// Page 0: offsets 0x00-0x7F
		...utils.unPrettyHex(`
                11 22 33 44 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE EE EE 03 EE 06 63 2E A0 EE EE EE EE
                61 3B 62 3B EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE
            `),
		// Punches at 0x38 (8-byte stride): [CN, SerH, SerM, SerL_Y_Mh, Ml_D_AP, TH, TL, SS]
		// Punch 0: code=31, time=8224=0x2020, AM, byte4=0x5E
		...[31, 0x00, 0x00, 0x00, 0x5E, 0x20, 0x20, 0x00],
		// Punch 1: code=32, time=8481=0x2121, PM, byte4=0x5F
		...[32, 0x00, 0x00, 0x00, 0x5F, 0x21, 0x21, 0x00],
		// Punch 2: code=33, time=8738=0x2222, AM, byte4=0x5E
		...[33, 0x00, 0x00, 0x00, 0x5E, 0x22, 0x22, 0x00],
		// Remaining space in page 0 (0x38 + 3*8 = 0x50 to 0x7F = 48 bytes)
		...Array(48).fill(0xEE),
		// Page 1: offsets 0x80-0xFF
		...getNoTimesPage()
	]
}));

export const getEmptyCard = utils.cached(cache, () => ({
	cardData: {
		uid: 0x11223344,
		cardNumber: 6500000,
		startTime: {time: 8721 + 43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time: 8735 + 43200, weekcounter: 3, weekday: 3},
		punchCount: 0,
		punches: [],
		cardHolder: {
			firstName: undefined,
			lastName: undefined,
			isComplete: false
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                11 22 33 44 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE EE EE 00 EE 06 63 2E A0 EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		...getNoTimesPage()
	]
}));

export const getTCardExamples = (): { [name: string]: SiCardSample } => ({
	cardWith3Punches: getCardWith3Punches(),
	emptyCard: getEmptyCard()
});
