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

// FCard: cardNumber 14500000 = 0xDD40A0
// SI bytes at offsets 0x19=0xDD, 0x1A=0x40, 0x1B=0xA0
// SI3 at offset 0x18 = 0x0E
// Uses SiCard8-compatible layout: punches at 0x88+ on page 1
export const getCardWith16Punches = utils.cached(cache, () => ({
	cardData: {
		uid: 0x1ABBCCDD,
		cardNumber: 14500000,
		startTime: {time: 8721 + 43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time: 8735 + 43200, weekcounter: 3, weekday: 3},
		punchCount: 16,
		punches: [
			{ code: 31, time: {time: 7967 + 43200, weekcounter: 1, weekday: 7} },
			{ code: 32, time: {time: 8224, weekcounter: 2, weekday: 0} },
			{ code: 33, time: {time: 8481 + 43200, weekcounter: 2, weekday: 0} },
			{ code: 34, time: {time: 8738, weekcounter: 2, weekday: 1} },
			{ code: 35, time: {time: 8995 + 43200, weekcounter: 2, weekday: 1} },
			{ code: 36, time: {time: 9252, weekcounter: 2, weekday: 2} },
			{ code: 37, time: {time: 9509 + 43200, weekcounter: 2, weekday: 2} },
			{ code: 38, time: {time: 9766, weekcounter: 2, weekday: 3} },
			{ code: 39, time: {time: 10023 + 43200, weekcounter: 2, weekday: 3} },
			{ code: 40, time: {time: 10280, weekcounter: 2, weekday: 4} },
			{ code: 41, time: {time: 10537 + 43200, weekcounter: 2, weekday: 4} },
			{ code: 42, time: {time: 10794, weekcounter: 2, weekday: 5} },
			{ code: 43, time: {time: 11051 + 43200, weekcounter: 2, weekday: 5} },
			{ code: 44, time: {time: 11308, weekcounter: 2, weekday: 6} },
			{ code: 45, time: {time: 11565 + 43200, weekcounter: 2, weekday: 6} },
			{ code: 46, time: {time: 11822, weekcounter: 2, weekday: 7} }
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
                1A BB CC DD EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE EE EE 10 EE 0E DD 40 A0 EE EE EE EE
                61 3B 62 3B EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		// Page 1: offsets 0x80-0xFF - punches at 0x88
		...utils.unPrettyHex(`
                20 20 20 20 20 20 20 20 1F 1F 1F 1F 20 20 20 20
                21 21 21 21 22 22 22 22 23 23 23 23 24 24 24 24
                25 25 25 25 26 26 26 26 27 27 27 27 28 28 28 28
                29 29 29 29 2A 2A 2A 2A 2B 2B 2B 2B 2C 2C 2C 2C
                2D 2D 2D 2D 2E 2E 2E 2E EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `)
	]
}));

export const getEmptyCard = utils.cached(cache, () => ({
	cardData: {
		uid: 0x1ABBCCDD,
		cardNumber: 14500000,
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
                1A BB CC DD EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE EE EE 00 EE 0E DD 40 A0 EE EE EE EE
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

export const getFCardExamples = (): { [name: string]: SiCardSample } => ({
	cardWith16Punches: getCardWith16Punches(),
	emptyCard: getEmptyCard()
});
