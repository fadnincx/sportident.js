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
// Punches at offsets 0x38, 0x3C, 0x40, 0x44, 0x48 (4-byte stride)
export const getCardWith5Punches = utils.cached(cache, () => ({
	cardData: {
		uid: 0x11223344,
		cardNumber: 6500000,
		startTime: {time: 8721 + 43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time: 8735 + 43200, weekcounter: 3, weekday: 3},
		punchCount: 5,
		punches: [
			{ code: 31, time: {time: 7967 + 43200, weekcounter: 1, weekday: 7} },
			{ code: 32, time: {time: 8224, weekcounter: 2, weekday: 0} },
			{ code: 33, time: {time: 8481 + 43200, weekcounter: 2, weekday: 0} },
			{ code: 34, time: {time: 8738, weekcounter: 2, weekday: 1} },
			{ code: 35, time: {time: 8995 + 43200, weekcounter: 2, weekday: 1} },
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
                EE EE EE EE EE EE 05 EE 06 63 2E A0 EE EE EE EE
                61 3B 62 3B EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE 1F 1F 1F 1F 20 20 20 20
                21 21 21 21 22 22 22 22 23 23 23 23 EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
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
	cardWith5Punches: getCardWith5Punches(),
	emptyCard: getEmptyCard()
});
