import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import * as testUtils from '../testUtils';
import { ReaderBtCardFamily, ReaderBtFeedbackType, ReaderBtPunchType } from './readerBtConstants';
import { parseCardReadout, type ReaderBtCardReadout, type ReaderBtPunch } from './readerBtProtocol';
import { SIAC_COMPLETE_PAYLOAD, SICARD8_COMPLETE_PAYLOAD, SICARD9_MINIMAL_PAYLOAD } from './readerBtExamples';
import { ReaderBtCard, getCardSeriesFromReadout, readoutToRaceResult, type IReaderBtCardSource } from './ReaderBtCard';

testUtils.useFakeTimers();

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

const punch = (punchType: number, controlCode: number, timeInWeekMs: number, controlInfo = 0): ReaderBtPunch => ({
	punchType: punchType,
	controlCode: controlCode,
	timeInWeekMs: timeInWeekMs,
	time: { time: Math.floor((timeInWeekMs % 86400000) / 1000), weekday: Math.floor(timeInWeekMs / 86400000), milliseconds: timeInWeekMs % 1000 },
	controlInfo: controlInfo,
	stationMode: controlInfo & 0x3f,
	beaconMode: (controlInfo & 0x20) !== 0,
	radioMode: (controlInfo & 0xc0) >> 6
});

const readout = (punches: ReaderBtPunch[], cardNumber = 8123456): ReaderBtCardReadout => ({
	cardNumber: cardNumber,
	cardFamily: ReaderBtCardFamily.Modern,
	punchCount: punches.length,
	punches: punches
});

const makeSource = (): { source: IReaderBtCardSource; feedbacks: number[]; requested: boolean[] } => {
	const feedbacks: number[] = [];
	const requested: boolean[] = [];
	return {
		feedbacks: feedbacks,
		requested: requested,
		source: {
			requestCardReadout: (complete) => {
				requested.push(complete);
				return Promise.resolve(parseCardReadout(SIAC_COMPLETE_PAYLOAD, true) as ReaderBtCardReadout);
			},
			sendFeedback: (feedbackType) => {
				feedbacks.push(feedbackType);
				return Promise.resolve();
			}
		}
	};
};

describe('getCardSeriesFromReadout', () => {
	test('maps the unambiguous families', () => {
		expect(getCardSeriesFromReadout(ReaderBtCardFamily.SiCard9, 1234567)).toEqual('SiCard9');
		expect(getCardSeriesFromReadout(ReaderBtCardFamily.SiCard8, 2003456)).toEqual('SiCard8');
		expect(getCardSeriesFromReadout(ReaderBtCardFamily.PCard, 4000123)).toEqual('PCard');
	});

	test('splits family 15 by card number, as SI3 0x0f is shared', () => {
		expect(getCardSeriesFromReadout(ReaderBtCardFamily.Modern, 7123456)).toEqual('SiCard10');
		expect(getCardSeriesFromReadout(ReaderBtCardFamily.Modern, 8123456)).toEqual('SIAC');
		expect(getCardSeriesFromReadout(ReaderBtCardFamily.Modern, 9123456)).toEqual('SiCard11');
	});

	test('defaults family 15 outside the known ranges to SiCard10', () => {
		expect(getCardSeriesFromReadout(ReaderBtCardFamily.Modern, 123)).toEqual('SiCard10');
	});

	test('returns undefined for an unknown family', () => {
		expect(getCardSeriesFromReadout(99, 123456)).toBeUndefined();
	});
});

describe('readoutToRaceResult', () => {
	test('routes each punch type to its field', () => {
		const result = readoutToRaceResult(
			readout([
				punch(ReaderBtPunchType.Clear, 0, 1000),
				punch(ReaderBtPunchType.Check, 0, 2000),
				punch(ReaderBtPunchType.Start, 1, 3000),
				punch(ReaderBtPunchType.Control, 31, 4000),
				punch(ReaderBtPunchType.Control, 32, 5000),
				punch(ReaderBtPunchType.Finish, 2, 6000)
			])
		);
		expect(result.clearTime?.time).toEqual(1);
		expect(result.checkTime?.time).toEqual(2);
		expect(result.startTime?.time).toEqual(3);
		expect(result.finishTime?.time).toEqual(6);
		expect(result.punches?.map((entry) => entry.code)).toEqual([31, 32]);
	});

	test('keeps start and finish out of punches so splits are not double counted', () => {
		const result = readoutToRaceResult(readout([punch(ReaderBtPunchType.Start, 1, 3000), punch(ReaderBtPunchType.Finish, 2, 6000)]));
		expect(result.punches).toEqual([]);
	});

	test('records reserve punches in their own fields', () => {
		const result = readoutToRaceResult(
			readout([
				punch(ReaderBtPunchType.Start, 1, 3000),
				punch(ReaderBtPunchType.StartReserve, 1, 3500),
				punch(ReaderBtPunchType.Finish, 2, 6000),
				punch(ReaderBtPunchType.FinishReserve, 2, 6500)
			])
		);
		expect(result.startTime?.time).toEqual(3);
		expect(result.startReserveTime?.time).toEqual(3);
		expect(result.finishTime?.time).toEqual(6);
		expect(result.finishReserveTime?.time).toEqual(6);
	});

	test('falls back to the reserve punch when the primary is missing', () => {
		const result = readoutToRaceResult(readout([punch(ReaderBtPunchType.StartReserve, 1, 3000), punch(ReaderBtPunchType.FinishReserve, 2, 6000)]));
		expect(result.startTime).toEqual(result.startReserveTime);
		expect(result.finishTime).toEqual(result.finishReserveTime);
	});

	test('keeps the first clear and check when duplicated', () => {
		const result = readoutToRaceResult(readout([punch(ReaderBtPunchType.Clear, 0, 1000), punch(ReaderBtPunchType.Clear, 0, 9000)]));
		expect(result.clearTime?.time).toEqual(1);
	});

	test('keeps the first reserve punch when duplicated', () => {
		const result = readoutToRaceResult(
			readout([
				punch(ReaderBtPunchType.StartReserve, 1, 1000),
				punch(ReaderBtPunchType.StartReserve, 1, 9000),
				punch(ReaderBtPunchType.FinishReserve, 2, 2000),
				punch(ReaderBtPunchType.FinishReserve, 2, 9000)
			])
		);
		expect(result.startReserveTime?.time).toEqual(1);
		expect(result.finishReserveTime?.time).toEqual(2);
	});

	test('keeps the first check when duplicated', () => {
		const result = readoutToRaceResult(readout([punch(ReaderBtPunchType.Check, 0, 1000), punch(ReaderBtPunchType.Check, 0, 9000)]));
		expect(result.checkTime?.time).toEqual(1);
	});

	test('keeps an unknown punch type rather than dropping it', () => {
		const result = readoutToRaceResult(readout([punch(99, 45, 1000)]));
		expect(result.punches).toEqual([expect.objectContaining({ code: 45, punchType: 99 })]);
	});

	test('carries the beacon and radio mode onto each punch', () => {
		const result = readoutToRaceResult(readout([punch(ReaderBtPunchType.Control, 31, 1000, 0xa0)]));
		expect(result.punches?.[0]).toEqual(expect.objectContaining({ beaconMode: true, radioMode: 2, controlInfo: 0xa0 }));
	});

	test('maps the SIAC production block, treating battery_mv as millivolts', () => {
		const parsed = parseCardReadout(SIAC_COMPLETE_PAYLOAD, true) as ReaderBtCardReadout;
		const result = readoutToRaceResult(parsed);
		expect(result.siac?.hardwareVersion).toEqual('1.6');
		expect(result.siac?.softwareVersion).toEqual('4.3');
		expect(result.siac?.signalCount).toEqual(12);
		expect(result.siac?.clearCount).toEqual(5);
		// 2950 mV, NOT the classic 1.9 + raw * 0.09 formula.
		expect(result.siac?.battery?.voltage).toEqual(2.95);
		expect(result.siac?.battery?.date).toEqual(new Date(2023, 3, 5));
	});

	test('carries the owner data through as cardHolder', () => {
		const parsed = parseCardReadout(SIAC_COMPLETE_PAYLOAD, true) as ReaderBtCardReadout;
		expect(readoutToRaceResult(parsed).cardHolder?.firstName).toEqual('Ada');
	});

	test('omits siac and cardHolder for a minimal readout', () => {
		const parsed = parseCardReadout(SICARD9_MINIMAL_PAYLOAD, false) as ReaderBtCardReadout;
		const result = readoutToRaceResult(parsed);
		expect(result.siac).toBeUndefined();
		expect(result.cardHolder).toBeUndefined();
	});
});

describe('ReaderBtCard', () => {
	test('is not registered in the shared serial card registry', () => {
		expect(ReaderBtCard.typeSpecificInstanceFromMessage()).toBeUndefined();
	});

	test('fromReadout populates the race result and card series', () => {
		const parsed = parseCardReadout(SIAC_COMPLETE_PAYLOAD, true) as ReaderBtCardReadout;
		const card = ReaderBtCard.fromReadout(parsed);
		expect(card.cardNumber).toEqual(8123456);
		expect(card.cardSeries).toEqual('SIAC');
		expect(card.cardFamily).toEqual(ReaderBtCardFamily.Modern);
		expect(card.records).toHaveLength(5);
		expect(card.toDict().punches?.map((entry) => entry.code)).toEqual([31]);
	});

	test('reads through its source and emits the read events', async () => {
		const { source, requested } = makeSource();
		const card = new ReaderBtCard(8123456);
		card.source = source;

		const phases: (string | undefined)[] = [];
		let completed = false;
		card.addEventListener('readProgress', (event) => phases.push(event.phase));
		card.addEventListener('readComplete', () => {
			completed = true;
		});

		await card.read();

		expect(requested).toEqual([true]);
		expect(completed).toBe(true);
		expect(phases).toContain('punches');
		expect(card.cardSeries).toEqual('SIAC');
	});

	test('follows real measurements without ever rewinding', async () => {
		const parsed = parseCardReadout(SIAC_COMPLETE_PAYLOAD, true) as ReaderBtCardReadout;
		let report: ((receivedBytes: number, totalBytes: number) => void) | undefined;
		let finishReadout: (() => void) | undefined;
		const card = new ReaderBtCard(8123456);
		card.source = {
			requestCardReadout: (_complete, onProgress) => {
				report = onProgress;
				return new Promise<ReaderBtCardReadout>((resolve) => {
					finishReadout = () => resolve(parsed);
				});
			},
			sendFeedback: () => Promise.resolve()
		};
		const percentages: number[] = [];
		card.addEventListener('readProgress', (event) => percentages.push(event.percentage));
		const reading = card.read();
		await testUtils.runPromises();

		// Measurements do not emit themselves; the progress timer picks them up.
		report!(150, 200);
		await testUtils.advanceTimersByTimeAsync(300);
		const afterThreeQuarters = percentages[percentages.length - 1];
		expect(afterThreeQuarters).toBeGreaterThan(0);

		// A late, lower measurement must not rewind the bar.
		report!(20, 200);
		await testUtils.advanceTimersByTimeAsync(300);
		expect(percentages[percentages.length - 1]).toBeGreaterThanOrEqual(afterThreeQuarters);

		// A zero total means the response was not segmented; must not divide by zero.
		report!(0, 0);
		finishReadout!();
		await reading;

		expect(percentages[percentages.length - 1]).toEqual(100);
		percentages.forEach((percentage, index) => {
			if (index > 0) {
				expect(percentage).toBeGreaterThanOrEqual(percentages[index - 1]);
			}
		});
	});

	test('requests a minimal readout in minimal mode', async () => {
		const { source, requested } = makeSource();
		const card = new ReaderBtCard(8123456);
		card.source = source;
		card.readMode = 'minimal';
		await card.read();
		expect(requested).toEqual([false]);
	});

	test('confirm sends an Ok feedback rather than a serial ACK', async () => {
		const { source, feedbacks } = makeSource();
		const card = new ReaderBtCard(8123456);
		card.source = source;
		await expect(card.confirm()).resolves.toEqual([]);
		expect(feedbacks).toEqual([ReaderBtFeedbackType.Ok]);
	});

	test('reportError sends an Error feedback', async () => {
		const { source, feedbacks } = makeSource();
		const card = new ReaderBtCard(8123456);
		card.source = source;
		await card.reportError();
		expect(feedbacks).toEqual([ReaderBtFeedbackType.Error]);
	});

	test('rejects every source-dependent operation without a station', async () => {
		const card = new ReaderBtCard(8123456);
		await expect(card.read()).rejects.toThrow('No Reader BT station');
		await expect(card.confirm()).rejects.toThrow('No Reader BT station');
		await expect(card.reportError()).rejects.toThrow('No Reader BT station');
	});

	test('reports a single read step', () => {
		const card = new ReaderBtCard(1);
		expect(card.getMaxReadSteps()).toEqual(1);
		expect(card.getEstimatedStepTimeMs()).toBeGreaterThan(0);
	});

	test('expects a SIAC to take longer than other cards', () => {
		expect(new ReaderBtCard(8200995).getEstimatedStepTimeMs()).toBeGreaterThan(new ReaderBtCard(1200995).getEstimatedStepTimeMs());
	});

	describe('getMonotonizedRaceResult', () => {
		test('folds the weekday into the time instead of adding a 12-hour carry', () => {
			// Saturday 23:50 then Sunday 00:05 of the same reading - the base
			// implementation would add SI_TIME_CUTOFF here and produce nonsense.
			const saturdayLate = 6 * 86400000 + 23 * 3600000 + 50 * 60000;
			const card = ReaderBtCard.fromReadout(
				readout([punch(ReaderBtPunchType.Start, 1, saturdayLate), punch(ReaderBtPunchType.Control, 31, saturdayLate + 900000)])
			);
			const monotonized = card.getMonotonizedRaceResult();
			expect(monotonized.startTime?.time).toEqual(6 * 86400 + 23 * 3600 + 50 * 60);
			expect(monotonized.punches?.[0].time?.time).toEqual(monotonized.startTime!.time + 900);
		});

		test('drops the weekday once it is folded in, so it cannot be counted twice', () => {
			const card = ReaderBtCard.fromReadout(readout([punch(ReaderBtPunchType.Start, 1, 2 * 86400000 + 5000)]));
			expect(card.getMonotonizedRaceResult().startTime?.weekday).toBeUndefined();
		});

		test('handles a timestamp with no weekday', () => {
			const card = ReaderBtCard.fromReadout(readout([]));
			card.raceResult.startTime = { time: 42 };
			expect(card.getMonotonizedRaceResult().startTime?.time).toEqual(42);
		});

		test('handles a race result with no punches at all', () => {
			const card = ReaderBtCard.fromReadout(readout([]));
			card.raceResult.punches = undefined;
			expect(card.getMonotonizedRaceResult().punches).toBeUndefined();
		});

		test('leaves unknown times as null', () => {
			const card = ReaderBtCard.fromReadout(readout([punch(ReaderBtPunchType.Start, 1, 1000)]));
			card.raceResult.punches = [{ code: 31, time: null }];
			expect(card.getMonotonizedRaceResult().punches?.[0].time).toBeNull();
		});

		test('feeds getNormalizedRaceResult, which zeroes on the start time', () => {
			const card = ReaderBtCard.fromReadout(
				readout([punch(ReaderBtPunchType.Start, 1, 3 * 86400000), punch(ReaderBtPunchType.Control, 31, 3 * 86400000 + 60000)])
			);
			const normalized = card.getNormalizedRaceResult();
			expect(normalized.startTime?.time).toEqual(0);
			expect(normalized.punches?.[0].time?.time).toEqual(60);
		});
	});

	test('leaves storage empty, since a Reader BT exposes no card memory', () => {
		const card = ReaderBtCard.fromReadout(parseCardReadout(SICARD8_COMPLETE_PAYLOAD, true) as ReaderBtCardReadout);
		expect(card.storage).toEqual({});
		expect(card.cardSeries).toEqual('SiCard8');
		expect(card.toDict().cardHolder).toEqual({ firstName: 'Alan', lastName: 'Turing', isComplete: true });
	});
});
