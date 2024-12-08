import * as utils from '../../utils';
import type { SiCardSample } from '../ISiCardExamples';

const cache = {};

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
		cardNumber: 1234567,
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
			isComplete: true
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE 0F 7F 10 09 0F 12 D6 87 06 0F 61 53
                61 3B 62 3B EE EE EE EE EE EE EE EE EE EE EE EE
                EE EE EE EE EE EE EE EE 1F 1F 1F 1F 20 20 20 20
                21 21 21 21 22 22 22 22 23 23 23 23 24 24 24 24
                25 25 25 25 26 26 26 26 27 27 27 27 28 28 28 28
                29 29 29 29 2A 2A 2A 2A 2B 2B 2B 2B 2C 2C 2C 2C
                2D 2D 2D 2D 2E 2E 2E 2E EE EE EE EE EE EE EE EE
            `),
		...getNoTimesPage()
	]
}));

export const getFullCard = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardNumber: 1234567,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: {time:8481+43200, weekcounter: 0, weekday: 3},
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
		punchCount: 50,
		punches: Array.from({length: 50}, (_, i) => i).map(() => ({ code: 32, time: {time: 8224 , weekcounter: 2, weekday: 0}})),
		cardHolder: {
			firstName: 'aaaaaaaaaaaaaaa',
			lastName: 'bbbbbbb',
			isComplete: true
		}
	},
	storageData: [
		...utils.unPrettyHex(`
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                07 04 21 21 0F 7F 32 09 0F 12 D6 87 06 0F 61 53
                61 61 61 61 61 61 61 61 61 61 61 61 61 61 61 3B
                62 62 62 62 62 62 62 3B 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
            `),
		...getFullTimesPage()
	]
}));

export const getEmptyCard = utils.cached(cache, () => ({
	cardData: {
		uid: 0x772a4299,
		cardNumber: 1234567,
		startTime: {time:8721+43200, weekcounter: 0, weekday: 3},
		finishTime: null,
		checkTime: {time:8735+43200, weekcounter: 3, weekday: 3},
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
                77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11
                EE EE EE EE 0F 7F 00 09 0F 12 D6 87 06 0F 61 53
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

export const getSiCard9Examples = (): { [name: string]: SiCardSample } => ({
	cardWith16Punches: getCardWith16Punches(),
	fullCard: getFullCard(),
	emptyCard: getEmptyCard()
});
