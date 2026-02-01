import { beforeEach, describe, expect, test } from '@jest/globals';
import { proto } from '../constants';
import type * as siProtocol from '../siProtocol';
import { BaseSiCard } from './BaseSiCard';
import type { SiCardReadPhase } from './ISiCardEvents';

beforeEach(() => {
	BaseSiCard.resetNumberRangeRegistry();
});

describe('BaseSiCard', () => {
	class FakeSiCard1 extends BaseSiCard {
		static typeSpecificInstanceFromMessage(_message: siProtocol.SiMessage): FakeSiCard1 | undefined {
			return undefined;
		}

		typeSpecificRead() {
			return Promise.resolve();
		}
	}
	class FakeSiCard2 extends BaseSiCard {
		static typeSpecificInstanceFromMessage(_message: siProtocol.SiMessage): FakeSiCard2 | undefined {
			return undefined;
		}

		typeSpecificRead() {
			return Promise.resolve();
		}
	}

	test('registerNumberRange', () => {
		BaseSiCard.registerNumberRange(100, 1000, FakeSiCard1);
		BaseSiCard.registerNumberRange(0, 100, FakeSiCard2);
		BaseSiCard.registerNumberRange(1000, 2000, FakeSiCard2);
		expect(BaseSiCard.getTypeByCardNumber(-1)).toEqual(undefined);
		expect(BaseSiCard.getTypeByCardNumber(0)).toEqual(FakeSiCard2);
		expect(BaseSiCard.getTypeByCardNumber(99)).toEqual(FakeSiCard2);
		expect(BaseSiCard.getTypeByCardNumber(100)).toEqual(FakeSiCard1);
		expect(BaseSiCard.getTypeByCardNumber(999)).toEqual(FakeSiCard1);
		expect(BaseSiCard.getTypeByCardNumber(1000)).toEqual(FakeSiCard2);
		expect(BaseSiCard.getTypeByCardNumber(1999)).toEqual(FakeSiCard2);
		expect(BaseSiCard.getTypeByCardNumber(2000)).toEqual(undefined);
	});
	test('fromCardNumber', () => {
		BaseSiCard.registerNumberRange(100, 1000, FakeSiCard1);
		const siCard500 = BaseSiCard.fromCardNumber(500);
		expect(siCard500 instanceof BaseSiCard).toBe(true);
		expect(siCard500 instanceof FakeSiCard1).toBe(true);
		const siCard5000 = BaseSiCard.fromCardNumber(5000);
		expect(siCard5000).toBe(undefined);
	});
	describe('detectFromMessage', () => {
		let triedToGetInstance = false;
		class SiCard1 extends BaseSiCard {
			static typeSpecificInstanceFromMessage(message: siProtocol.SiMessage) {
				triedToGetInstance = true;
				if (message.mode !== undefined) {
					return undefined;
				}
				return new SiCard1(1);
			}

			typeSpecificRead() {
				return Promise.resolve();
			}
		}

		beforeEach(() => {
			BaseSiCard.registerNumberRange(1000, 10000, SiCard1);
			BaseSiCard.registerNumberRange(10000, 20000, FakeSiCard2);
		});

		test('detects card from valid message', () => {
			expect(triedToGetInstance).toBe(false);
			const siCard500 = BaseSiCard.detectFromMessage({
				command: proto.cmd.SI5_DET,
				parameters: []
			});
			expect(triedToGetInstance).toBe(true);
			expect(siCard500 instanceof SiCard1).toBe(true);
			expect(siCard500?.cardNumber).toBe(1);
		});

		test('does not detect from NAK message', () => {
			const nakMessage = BaseSiCard.detectFromMessage({
				mode: proto.NAK
			});
			expect(nakMessage).toBe(undefined);
		});
	});
	test('read', async () => {
		class SiCard1 extends BaseSiCard {
			typeSpecificRead() {
				this.raceResult.startTime = {time:1};
				return Promise.resolve();
			}
		}
		const siCard500 = new SiCard1(500);
		try {
			await siCard500.confirm();
			expect({ canConfirm: true }).toEqual({ canConfirm: false });
		} catch (err) {
			// ignore
		}
		siCard500.mainStation = {
			sendMessage: (_message: siProtocol.SiMessage, _numResponses?: number) => Promise.resolve([])
		};
		const result = await siCard500.read();
		expect(result).toBe(siCard500);
		expect(JSON.stringify(siCard500.raceResult.startTime)).toBe(JSON.stringify({time:1}));
		await siCard500.confirm();
	});
	const emptySiCard = new FakeSiCard1(501);
	const nonemptySiCard = new FakeSiCard1(502);
	nonemptySiCard.raceResult = {
		cardNumber: 502,
		clearTime: {time:1},
		checkTime: {time:2},
		startTime: {time:1},
		punches: [{ code: 31, time: {time:2} }],
		finishTime: {time:1},
		cardHolder: { firstName: 'John' }
	};
	test('Empty SiCard toDict', async () => {
		expect(emptySiCard.toDict()).toEqual({
			cardNumber: 501,
			clearTime: undefined,
			checkTime: undefined,
			startTime: undefined,
			finishTime: undefined,
			punches: undefined,
			cardHolder: undefined
		});
	});
	test('Non-empty SiCard toDict', async () => {
		expect(nonemptySiCard.toDict()).toEqual({
			cardNumber: 502,
			clearTime: {time:1},
			checkTime: {time:2},
			startTime: {time:1},
			finishTime: {time:1},
			punches: [{ code: 31, time: {time:2} }],
			cardHolder: { firstName: 'John' }
		});
	});
	test('Empty SiCard toString', async () => {
		expect(emptySiCard.toString()).toEqual('FakeSiCard1\nCard Number: 501\nClear: ?\nCheck: ?\nStart: ?\nFinish: ?\n? Punches\nCard Holder:\n?\n');
	});
	test('Non-empty SiCard toString', async () => {
		expect(nonemptySiCard.toString()).toEqual('FakeSiCard1\nCard Number: 502\nClear: 1\nCheck: 2\nStart: 1\nFinish: 1\n31: 2\nCard Holder:\nfirstName: John\n');
	});
	test('Empty SiCard getMonotonizedRaceResult', async () => {
		expect(emptySiCard.getMonotonizedRaceResult()).toEqual({
			cardNumber: 501,
			clearTime: undefined,
			checkTime: undefined,
			startTime: undefined,
			finishTime: undefined,
			punches: undefined,
			cardHolder: undefined
		});
	});
	test('Non-empty SiCard getMonotonizedRaceResult', async () => {
		expect(nonemptySiCard.getMonotonizedRaceResult()).toEqual({
			cardNumber: 502,
			clearTime: {time:1},
			checkTime: {time:2},
			startTime: {time:43201},
			finishTime: {time:86401},
			punches: [{ code: 31, time: {time:43202} }],
			cardHolder: { firstName: 'John' }
		});
	});
	test('Empty SiCard getNormalizedRaceResult', async () => {
		expect(() => emptySiCard.getNormalizedRaceResult()).toThrow();
	});
	test('Non-empty SiCard getNormalizedRaceResult', async () => {
		expect(nonemptySiCard.getNormalizedRaceResult()).toEqual({
			cardNumber: 502,
			clearTime: {time:-43200},
			checkTime: {time:-43199},
			startTime: {time:0},
			finishTime: {time:43200},
			punches: [{ code: 31, time: {time:1} }],
			cardHolder: { firstName: 'John' }
		});
	});

	describe('progress events', () => {
		test('emits readStart, readProgress, readComplete on successful read', async () => {
			class TestCard extends BaseSiCard {
				getMaxReadSteps() { return 2; }
				getEstimatedStepTimeMs() { return 10; }
				typeSpecificRead() {
					this.emitProgress('basic', 0);
					this.emitProgress('punches', 1);
					return Promise.resolve();
				}
			}

			const card = new TestCard(123);
			const events: string[] = [];

			card.addEventListener('readStart', () => events.push('readStart'));
			card.addEventListener('readProgress', () => events.push('readProgress'));
			card.addEventListener('readComplete', () => events.push('readComplete'));

			await card.read();

			expect(events).toContain('readStart');
			expect(events).toContain('readProgress');
			expect(events).toContain('readComplete');
			expect(events.indexOf('readStart')).toBe(0);
			expect(events.indexOf('readComplete')).toBe(events.length - 1);
		});

		test('emits readError on failed read', async () => {
			class FailingCard extends BaseSiCard {
				getEstimatedStepTimeMs() { return 10; }
				typeSpecificRead() {
					return Promise.reject(new Error('Test error'));
				}
			}

			const card = new FailingCard(123);
			let errorEvent: Error | undefined;

			card.addEventListener('readError', (e) => {
				errorEvent = e.error;
			});

			await expect(card.read()).rejects.toThrow('Test error');
			expect(errorEvent).toBeDefined();
			expect(errorEvent?.message).toBe('Test error');
		});

		test('readStart contains correct totalSteps', async () => {
			class TestCard extends BaseSiCard {
				getMaxReadSteps() { return 4; }
				getEstimatedStepTimeMs() { return 10; }
				typeSpecificRead() { return Promise.resolve(); }
			}

			const card = new TestCard(123);
			let totalSteps: number | undefined;

			card.addEventListener('readStart', (e) => {
				totalSteps = e.totalSteps;
			});

			await card.read();

			expect(totalSteps).toBe(4);
		});

		test('milestone progress events have correct percentage', async () => {
			class TestCard extends BaseSiCard {
				getMaxReadSteps() { return 2; }
				getEstimatedStepTimeMs() { return 10; }
				typeSpecificRead() {
					this.emitProgress('basic', 0);
					this.emitProgress('punches', 1);
					return Promise.resolve();
				}
			}

			const card = new TestCard(123);
			const percentages: number[] = [];
			const phases: (SiCardReadPhase | undefined)[] = [];

			card.addEventListener('readProgress', (e) => {
				if (e.phase !== undefined) {
					percentages.push(e.percentage);
					phases.push(e.phase);
				}
			});

			await card.read();

			expect(percentages).toContain(50);
			expect(percentages).toContain(100);
			expect(phases).toContain('basic');
			expect(phases).toContain('punches');
		});

		test('interpolated progress is less than milestone', async () => {
			class TestCard extends BaseSiCard {
				getMaxReadSteps() { return 1; }
				getEstimatedStepTimeMs() { return 200; }
				typeSpecificRead() {
					return new Promise<void>((resolve) => {
						setTimeout(() => {
							this.emitProgress('basic', 0);
							resolve();
						}, 100);
					});
				}
			}

			const card = new TestCard(123);
			const percentages: number[] = [];

			card.addEventListener('readProgress', (e) => {
				percentages.push(e.percentage);
			});

			await card.read();

			const interpolatedPercentages = percentages.slice(0, -1);
			const milestonePercentage = percentages[percentages.length - 1];
			expect(milestonePercentage).toBe(100);
			for (const pct of interpolatedPercentages) {
				expect(pct).toBeLessThan(100);
			}
		});

		test('progress event contains siCard reference', async () => {
			class TestCard extends BaseSiCard {
				getMaxReadSteps() { return 1; }
				getEstimatedStepTimeMs() { return 10; }
				typeSpecificRead() {
					this.emitProgress('basic', 0);
					return Promise.resolve();
				}
			}

			const card = new TestCard(123);
			let eventCard: BaseSiCard | undefined;

			card.addEventListener('readProgress', (e) => {
				eventCard = e.siCard;
			});

			await card.read();

			expect(eventCard).toBe(card);
		});

		test('progress event contains pageNumber when provided', async () => {
			class TestCard extends BaseSiCard {
				getMaxReadSteps() { return 1; }
				getEstimatedStepTimeMs() { return 10; }
				typeSpecificRead() {
					this.emitProgress('basic', 42);
					return Promise.resolve();
				}
			}

			const card = new TestCard(123);
			let pageNumber: number | undefined;

			card.addEventListener('readProgress', (e) => {
				if (e.phase !== undefined) {
					pageNumber = e.pageNumber;
				}
			});

			await card.read();

			expect(pageNumber).toBe(42);
		});
	});
});
