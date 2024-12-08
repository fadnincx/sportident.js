import * as utils from '../../utils';
import type { SiCardSample } from '../ISiCardExamples';
import { ModernSiCardSeries } from './ModernSiCard';

const cache = {};

const getUnknownPage = utils.cached(cache, () => Array.from({length: 128}, (_, i) => i).map(() => undefined));
const getEmptyPage = utils.cached(cache, () =>
	utils.unPrettyHex(`
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
    `)
);
const getFullTimesPage = utils.cached(cache, () =>
	utils.unPrettyHex(`
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
        20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
    `)
);
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

export const getCardWith16Punches = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardSeries: ModernSiCardSeries.SiCard10,
		cardNumber: 7050892,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
		punchCount: 16,
		punches: [
			{ code: 31, time: {time:7967+43200, weekcounter: 1, weekday: 7} },
			{ code: 32, time: {time:8224, weekcounter: 2, weekday: 0} },
			{ code: 33, time: {time:8481+43200, weekcounter: 2, weekday: 0} },
			{ code: 34, time: {time:8738, weekcounter: 2, weekday: 1} },
			{ code: 35, time: {time:8995+43200, weekcounter: 2, weekday: 1} },
			{ code: 36, time: {time:9252, weekcounter: 2, weekday: 2} },
			{ code: 37, time: {time:9509+43200, weekcounter: 2, weekday: 2} },
			{ code: 38, time: {time:9766, weekcounter: 2, weekday: 3} },
			{ code: 39, time: {time:10023+43200, weekcounter: 2, weekday: 3} },
			{ code: 40, time: {time:10280, weekcounter: 2, weekday: 4} },
			{ code: 41, time: {time:10537+43200, weekcounter: 2, weekday: 4} },
			{ code: 42, time: {time:10794, weekcounter: 2, weekday: 5} },
			{ code: 43, time: {time:11051+43200, weekcounter: 2, weekday: 5} },
			{ code: 44, time: {time:11308, weekcounter: 2, weekday: 6} },
			{ code: 45, time: {time:11565+43200, weekcounter: 2, weekday: 6} },
			{ code: 46, time: {time:11822, weekcounter: 2, weekday: 7} }
		],
		cardHolder: {
			firstName: 'a',
			lastName: 'b',
			gender: 'c',
			birthday: 'd',
			club: 'e',
			email: 'f',
			phone: 'g',
			city: 'h',
			street: 'i',
			zip: 'j',
			country: 'k',
			isComplete: true
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE 0F 7F 10 09 0F 6B 96 8C 06 0F 61 53
                61 3B 62 3B 63 3B 64 3B 65 3B 66 3B 67 3B 68 3B
                69 3B 6A 3B 6B 3B EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		...getEmptyPage(),
		...getEmptyPage(),
		...getEmptyPage(),
		...utils.unPrettyHex(`
                1F 1F 1F 1F 20 20 20 20 21 21 21 21 22 22 22 22
                23 23 23 23 24 24 24 24 25 25 25 25 26 26 26 26
                27 27 27 27 28 28 28 28 29 29 29 29 2A 2A 2A 2A
                2B 2B 2B 2B 2C 2C 2C 2C 2D 2D 2D 2D 2E 2E 2E 2E
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		...getNoTimesPage(),
		...getNoTimesPage(),
		...getNoTimesPage()
	]
}));

export const getCardWith64Punches = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardSeries: ModernSiCardSeries.SiCard10,
		cardNumber: 7050892,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
		punchCount: 64,
		punches: Array.from({length: 64}, (_, i) => i).map(() => ({ code: 32, time: {time:8224, weekcounter: 2, weekday: 0} })),
		cardHolder: {
			firstName: 'a',
			lastName: 'b',
			gender: 'c',
			birthday: 'd',
			club: 'e',
			email: 'f',
			phone: 'g',
			city: 'h',
			street: 'i',
			zip: 'j',
			country: 'k',
			isComplete: true
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE 0F 7F 40 09 0F 6B 96 8C 06 0F 61 53
                61 3B 62 3B 63 3B 64 3B 65 3B 66 3B 67 3B 68 3B
                69 3B 6A 3B 6B 3B EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		...getEmptyPage(),
		...getEmptyPage(),
		...getEmptyPage(),
		...getFullTimesPage(),
		...getFullTimesPage(),
		...getNoTimesPage(),
		...getNoTimesPage()
	]
}));

export const getCardWith96Punches = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardSeries: ModernSiCardSeries.SiCard10,
		cardNumber: 7050892,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
		punchCount: 96,
		punches: Array.from({length: 96}, (_, i) => i).map(() => ({ code: 32, time: {time:8224, weekcounter: 2, weekday: 0} })),
		cardHolder: {
			firstName: 'a',
			lastName: 'b',
			gender: 'c',
			birthday: 'd',
			club: 'e',
			email: 'f',
			phone: 'g',
			city: 'h',
			street: 'i',
			zip: 'j',
			country: 'k',
			isComplete: true
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE 0F 7F 60 09 0F 6B 96 8C 06 0F 61 53
                61 3B 62 3B 63 3B 64 3B 65 3B 66 3B 67 3B 68 3B
                69 3B 6A 3B 6B 3B EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		...getEmptyPage(),
		...getEmptyPage(),
		...getEmptyPage(),
		...getFullTimesPage(),
		...getFullTimesPage(),
		...getFullTimesPage(),
		...getNoTimesPage()
	]
}));

export const getFullCard = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardSeries: ModernSiCardSeries.SiCard10,
		cardNumber: 7050892,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: {time:8481+43200, weekcounter: 0, weekday: 3},
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
		punchCount: 128,
		punches: Array.from({length: 128}, (_, i) => i).map(() => ({ code: 32, time: {time:8224, weekcounter: 2, weekday: 0} })),
		cardHolder: {
			firstName: 'aaaaaaaaaaaaaaa',
			lastName: 'bbbbbbbbbbbbbbb',
			gender: 'ccccccccccccccc',
			birthday: 'ddddddddddddddd',
			club: 'eeeeeee',
			email: 'fffffff',
			phone: 'ggggggg',
			city: 'hhhhhhh',
			street: 'iiiiiii',
			zip: 'jjjjjjj',
			country: 'kkkkkkk',
			isComplete: true
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                07 04 21 21 0F 7F 80 09 0F 6B 96 8C 06 0F 61 53
                61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 3B
                62 62 62 62 62 62 62 62 62 62 62 62 62 62 62 3B
                63 63 63 63 63 63 63 63 63 63 63 63 63 63 63 3B
                64 64 64 64 64 64 64 64 64 64 64 64 64 64 64 3B
                65 65 65 65 65 65 65 3B 66 66 66 66 66 66 66 3B
                67 67 67 67 67 67 67 3B 68 68 68 68 68 68 68 3B
            `),
		...utils.unPrettyHex(`
                69 69 69 69 69 69 69 3B 6A 6A 6A 6A 6A 6A 6A 3B
                6B 6B 6B 6B 6B 6B 6B 3B EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		...getEmptyPage(),
		...getEmptyPage(),
		...getFullTimesPage(),
		...getFullTimesPage(),
		...getFullTimesPage(),
		...getFullTimesPage()
	]
}));

export const getPartialCardHolderCard = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardSeries: ModernSiCardSeries.SiCard10,
		cardNumber: 7050892,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
		punchCount: 128,
		punches: Array.from({length: 128}, (_, i) => i).map(() => ({ code: 32, time: {time:8224, weekcounter: 2, weekday: 0} })),
		cardHolder: {
			firstName: 'aaaaaaaaaaaaaaa',
			lastName: 'bbbbbbbbbbbbbbb',
			gender: 'ccccccccccccccc',
			birthday: 'ddddddddddddddd',
			club: 'eeeeeee',
			email: 'fffffff',
			phone: 'ggggggg',
			city: undefined,
			street: undefined,
			zip: undefined,
			country: undefined,
			isComplete: false
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE 0F 7F 80 09 0F 6B 96 8C 06 0F 61 53
                61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 3B
                62 62 62 62 62 62 62 62 62 62 62 62 62 62 62 3B
                63 63 63 63 63 63 63 63 63 63 63 63 63 63 63 3B
                64 64 64 64 64 64 64 64 64 64 64 64 64 64 64 3B
                65 65 65 65 65 65 65 3B 66 66 66 66 66 66 66 3B
                67 67 67 67 67 67 67 3B 68 68 68 68 68 68 68 68
            `),
		...getUnknownPage(),
		...getEmptyPage(),
		...getEmptyPage(),
		...getFullTimesPage(),
		...getFullTimesPage(),
		...getFullTimesPage(),
		...getFullTimesPage()
	]
}));

export const getEmptyCard = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardSeries: ModernSiCardSeries.SiCard10,
		cardNumber: 7050892,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
		punchCount: 0,
		punches: [],
		cardHolder: {
			firstName: undefined,
			lastName: undefined,
			gender: undefined,
			birthday: undefined,
			club: undefined,
			email: undefined,
			phone: undefined,
			city: undefined,
			street: undefined,
			zip: undefined,
			country: undefined,
			isComplete: false
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE 0F 7F 00 09 0F 6B 96 8C 06 0F 61 53
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE EE
            `),
		...getEmptyPage(),
		...getEmptyPage(),
		...getEmptyPage(),
		...getNoTimesPage(),
		...getNoTimesPage(),
		...getNoTimesPage(),
		...getNoTimesPage()
	]
}));

export const getModernSiCardExamples = (): { [name: string]: SiCardSample } => ({
	cardWith16Punches: getCardWith16Punches(),
	cardWith64Punches: getCardWith64Punches(),
	cardWith96Punches: getCardWith96Punches(),
	fullCard: getFullCard(),
	partialCardHolderCard: getPartialCardHolderCard(),
	emptyCard: getEmptyCard()
});
