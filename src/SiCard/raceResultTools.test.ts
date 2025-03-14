import { describe, expect, test } from '@jest/globals';
import type { IRaceResultData } from './IRaceResultData';
import { getOrderedRaceResult, getRaceResultFromOrdered, type IOrderedRaceResult, makeStartZeroTime, monotonizeOrderedRaceResult, monotonizeRaceResult, prettyRaceResult } from './raceResultTools';

const EMPTY_RACE_RESULT: IRaceResultData = {};
const EMPTY_ORDERED_RACE_RESULT: IOrderedRaceResult = {
	orderedTimes: []
};

const UNKNOWN_PUNCH_TIME_RACE_RESULT: IRaceResultData = {
	punches: [{ code: 31, time: null }]
};
const UNKNOWN_PUNCH_TIME_ORDERED_RACE_RESULT: IOrderedRaceResult = {
	orderedTimes: [],
	punches: [{ code: 31, timeIndex: null }]
};

const WITHOUT_PUNCHES_RACE_RESULT: IRaceResultData = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	clearTime: {time:1},
	checkTime: {time:2},
	startTime: {time:3},
	finishTime: {time:6}
};
const WITHOUT_PUNCHES_ORDERED_RACE_RESULT: IOrderedRaceResult = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	orderedTimes: [{time:1}, {time:2}, {time:3}, {time:6}],
	clearTimeIndex: 0,
	checkTimeIndex: 1,
	startTimeIndex: 2,
	finishTimeIndex: 3
};

const COMPLETE_RACE_RESULT: IRaceResultData = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	clearTime: {time:1},
	checkTime: {time:2},
	startTime: {time:3},
	finishTime: {time:6},
	punches: [
		{ code: 31, time: {time:4} },
		{ code: 32, time: {time:5} }
	]
};
const COMPLETE_ORDERED_RACE_RESULT: IOrderedRaceResult = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	orderedTimes: [{time:1}, {time:2}, {time:3}, {time:4}, {time:5}, {time:6}],
	clearTimeIndex: 0,
	checkTimeIndex: 1,
	startTimeIndex: 2,
	punches: [
		{ code: 31, timeIndex: 3 },
		{ code: 32, timeIndex: 4 }
	],
	finishTimeIndex: 5
};

const UNKNOWN_TIMES_RACE_RESULT: IRaceResultData = {
	checkTime: {time:2},
	startTime: {time:3},
	finishTime: {time:6},
	punches: [
		{ code: 31, time: null },
		{ code: 32, time: {time:5} }
	]
};
const UNKNOWN_TIMES_ORDERED_RACE_RESULT: IOrderedRaceResult = {
	orderedTimes: [{time:2}, {time:3}, {time:5}, {time:6}],
	checkTimeIndex: 0,
	startTimeIndex: 1,
	punches: [
		{ code: 31, timeIndex: null },
		{ code: 32, timeIndex: 2 }
	],
	finishTimeIndex: 3
};

const IMMONOTONE_RACE_RESULT: IRaceResultData = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	clearTime: {time:1},
	checkTime: {time:2},
	startTime: {time:1},
	finishTime: {time:2},
	punches: [
		{ code: 31, time: {time:2} },
		{ code: 32, time: {time:1} }
	]
};
const MONOTONE_RACE_RESULT: IRaceResultData = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	clearTime: {time:1},
	checkTime: {time:2},
	startTime: {time:43201},
	finishTime: {time:86402},
	punches: [
		{ code: 31, time: {time:43202} },
		{ code: 32, time: {time:86401} }
	]
};

const IMMONOTONE_ORDERED_RACE_RESULT: IOrderedRaceResult = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	orderedTimes: [{time:1}, {time:2}, {time:1}, {time:2}, {time:1}, {time:2}],
	clearTimeIndex: 0,
	checkTimeIndex: 1,
	startTimeIndex: 2,
	punches: [
		{ code: 31, timeIndex: 3 },
		{ code: 32, timeIndex: 4 }
	],
	finishTimeIndex: 5
};
const MONOTONE_ORDERED_RACE_RESULT: IOrderedRaceResult = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	orderedTimes: [{time:1}, {time:2}, {time:43201}, {time:43202}, {time:86401}, {time:86402}],
	clearTimeIndex: 0,
	checkTimeIndex: 1,
	startTimeIndex: 2,
	punches: [
		{ code: 31, timeIndex: 3 },
		{ code: 32, timeIndex: 4 }
	],
	finishTimeIndex: 5
};

const COMPLETE_START_ZEROED_RACE_RESULT: IRaceResultData = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	clearTime: {time:-2},
	checkTime: {time:-1},
	startTime: {time:0},
	finishTime: {time:3},
	punches: [
		{ code: 31, time: {time:1} },
		{ code: 32, time: {time:2} }
	]
};

const UNKNOWN_TIMES_START_ZEROED_RACE_RESULT: IRaceResultData = {
	checkTime: {time:-1},
	startTime: {time:0},
	finishTime: {time:3},
	punches: [
		{ code: 31, time: null },
		{ code: 32, time: {time:2} }
	]
};

const WITHOUT_PUNCHES_START_ZEROED_RACE_RESULT: IRaceResultData = {
	cardNumber: 1234,
	cardHolder: { firstName: 'John' },
	clearTime: {time:-2},
	checkTime: {time:-1},
	startTime: {time:0},
	finishTime: {time:3}
};

describe('raceResultTools', () => {
	describe('prettyRaceResult', () => {
		test('works for empty race result', async () => {
			const emptyRaceResult: IRaceResultData = {};
			expect(prettyRaceResult(emptyRaceResult)).toEqual('Card Number: ?\nClear: ?\nCheck: ?\nStart: ?\nFinish: ?\n? Punches\nCard Holder:\n?\n');
		});
		test('works for race result with zero punches', async () => {
			const zeroPunchesRaceResult: IRaceResultData = {
				punches: []
			};
			expect(prettyRaceResult(zeroPunchesRaceResult)).toEqual('Card Number: ?\nClear: ?\nCheck: ?\nStart: ?\nFinish: ?\nNo Punches\nCard Holder:\n?\n');
		});
		test('works for race result with empty card holder', async () => {
			const emptyCardHolderRaceResult: IRaceResultData = {
				cardHolder: {}
			};
			expect(prettyRaceResult(emptyCardHolderRaceResult)).toEqual('Card Number: ?\nClear: ?\nCheck: ?\nStart: ?\nFinish: ?\n? Punches\nCard Holder:\nEmpty Card Holder\n');
		});
		test('works for complete race result', async () => {
			const completeRaceResult: IRaceResultData = {
				cardNumber: 123,
				cardHolder: { firstName: 'John' },
				clearTime: {time:1},
				checkTime: {time:2},
				startTime: {time:3},
				finishTime: {time:5},
				punches: [{ code: 31, time: {time:4} }]
			};
			expect(prettyRaceResult(completeRaceResult)).toEqual('Card Number: 123\nClear: 1\nCheck: 2\nStart: 3\nFinish: 5\n31: 4\nCard Holder:\nfirstName: John\n');
		});
	});

	describe('getOrderedRaceResult', () => {
		test('works for empty race result', async () => {
			expect(getOrderedRaceResult(EMPTY_RACE_RESULT)).toEqual(EMPTY_ORDERED_RACE_RESULT);
		});
		test('works for race result with punches of unknown time', async () => {
			expect(getOrderedRaceResult(UNKNOWN_PUNCH_TIME_RACE_RESULT)).toEqual(UNKNOWN_PUNCH_TIME_ORDERED_RACE_RESULT);
		});
		test('works for complete race result', async () => {
			expect(getOrderedRaceResult(COMPLETE_RACE_RESULT)).toEqual(COMPLETE_ORDERED_RACE_RESULT);
		});
		test('works for race result without punches', async () => {
			expect(getOrderedRaceResult(WITHOUT_PUNCHES_RACE_RESULT)).toEqual(WITHOUT_PUNCHES_ORDERED_RACE_RESULT);
		});
		test('works for race result without clearTime and startTime', async () => {
			expect(getOrderedRaceResult(UNKNOWN_TIMES_RACE_RESULT)).toEqual(UNKNOWN_TIMES_ORDERED_RACE_RESULT);
		});
	});

	describe('getRaceResultFromOrdered', () => {
		test('works for empty race result', async () => {
			expect(getRaceResultFromOrdered(EMPTY_ORDERED_RACE_RESULT)).toEqual(EMPTY_RACE_RESULT);
		});
		test('works for race result with punches of unknown time', async () => {
			expect(getRaceResultFromOrdered(UNKNOWN_PUNCH_TIME_ORDERED_RACE_RESULT)).toEqual(UNKNOWN_PUNCH_TIME_RACE_RESULT);
		});
		test('works for complete race result', async () => {
			expect(getRaceResultFromOrdered(COMPLETE_ORDERED_RACE_RESULT)).toEqual(COMPLETE_RACE_RESULT);
		});
		test('works for race result without punches', async () => {
			expect(getRaceResultFromOrdered(WITHOUT_PUNCHES_ORDERED_RACE_RESULT)).toEqual(WITHOUT_PUNCHES_RACE_RESULT);
		});
		test('works for race result without clearTime and punch[0]', async () => {
			expect(getRaceResultFromOrdered(UNKNOWN_TIMES_ORDERED_RACE_RESULT)).toEqual(UNKNOWN_TIMES_RACE_RESULT);
		});
	});

	describe('monotonizeOrderedRaceResult', () => {
		test('works for ordered race result', async () => {
			expect(monotonizeOrderedRaceResult(IMMONOTONE_ORDERED_RACE_RESULT)).toEqual(MONOTONE_ORDERED_RACE_RESULT);
		});
	});

	describe('monotonizeRaceResult', () => {
		test('works for race result', async () => {
			expect(monotonizeRaceResult(IMMONOTONE_RACE_RESULT)).toEqual(MONOTONE_RACE_RESULT);
		});
	});

	describe('makeStartZeroTime', () => {
		test('works for complete race result', async () => {
			expect(makeStartZeroTime(COMPLETE_RACE_RESULT)).toEqual(COMPLETE_START_ZEROED_RACE_RESULT);
		});
		test('works for race result with unknown times', async () => {
			expect(makeStartZeroTime(UNKNOWN_TIMES_RACE_RESULT)).toEqual(UNKNOWN_TIMES_START_ZEROED_RACE_RESULT);
		});
		test('works for race result without punches', async () => {
			expect(makeStartZeroTime(WITHOUT_PUNCHES_RACE_RESULT)).toEqual(WITHOUT_PUNCHES_START_ZEROED_RACE_RESULT);
		});
		test('fails for race result without start time', async () => {
			expect(() => makeStartZeroTime(EMPTY_RACE_RESULT)).toThrow();
		});
	});
});
