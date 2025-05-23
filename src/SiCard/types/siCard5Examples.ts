import * as utils from '../../utils';
import type { SiCardSample } from '../ISiCardExamples';

const cache = {};

export const getCardWith16Punches = utils.cached(cache, () => ({
	cardData: {
		cardNumber: 406402,
		startTime: {time:7643},
		finishTime: {time:7727},
		checkTime: null,
		punchCount: 16,
		punches: [
			{ code: 31, time: {time:7967} },
			{ code: 32, time: {time:8224} },
			{ code: 33, time: {time:8481} },
			{ code: 34, time: {time:8738} },
			{ code: 35, time: {time:8995} },
			{ code: 36, time: {time:9252} },
			{ code: 37, time: {time:9509} },
			{ code: 38, time: {time:9766} },
			{ code: 39, time: {time:10023} },
			{ code: 40, time: {time:10280} },
			{ code: 41, time: {time:10537} },
			{ code: 42, time: {time:10794} },
			{ code: 43, time: {time:11051} },
			{ code: 44, time: {time:11308} },
			{ code: 45, time: {time:11565} },
			{ code: 46, time: {time:11822} }
		]
	},
	storageData: [
		...utils.unPrettyHex(`
                AA 29 00 01 19 02 04 00 00 00 00 00 00 00 00 00
                65 19 02 1D DB 1E 2F 11 56 EE EE 28 04 1F 00 07
                00 1F 1F 1F 20 20 20 21 21 21 22 22 22 23 23 23
                00 24 24 24 25 25 25 26 26 26 27 27 27 28 28 28
                00 29 29 29 2A 2A 2A 2B 2B 2B 2C 2C 2C 2D 2D 2D
                00 2E 2E 2E 00 EE EE 00 EE EE 00 EE EE 00 EE EE
                00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE
                00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE
            `)
	]
}));

export const getFullCard = utils.cached(cache, () => ({
	cardData: {
		cardNumber: 406402,
		startTime: {time:7643},
		finishTime: {time:7727},
		checkTime: {time:7632},
		punchCount: 36,
		punches: [...Array.from({length: 30}, (_, i) => i).map(() => ({ code: 32, time: {time:8224} })), ...Array.from({length: 6}, (_, i) => i).map(() => ({ code: 32, time: null }))]
	},
	storageData: [
		...utils.unPrettyHex(`
                AA 29 00 01 19 02 04 00 00 00 00 00 00 00 00 00
                65 19 02 1D DB 1E 2F 25 56 1D D0 28 04 1F 00 07
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
                20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
            `)
	]
}));

export const getSiCard5Examples = (): { [name: string]: SiCardSample } => ({
	cardWith16Punches: getCardWith16Punches(),
	fullCard: getFullCard()
});
