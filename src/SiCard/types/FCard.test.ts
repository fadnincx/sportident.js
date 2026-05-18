import { describe, expect, test } from '@jest/globals';
import { BaseSiCard } from '../BaseSiCard';
import { getPunchOffset, FCard } from './FCard';
import { proto } from '../../constants';
import * as siProtocol from '../../siProtocol';
import * as testUtils from '../../testUtils';
import { ModernSiCardSeries } from './ModernSiCard';
import { getFCardExamples } from './fCardExamples';
import { FakeFCard } from '../../fakes/FakeSiCard/types/FakeFCard';

describe('FCard', () => {
	test('is registered', () => {
		expect(BaseSiCard.getTypeByCardNumber(13999999)).not.toEqual(FCard);
		expect(BaseSiCard.getTypeByCardNumber(14000000)).toEqual(FCard);
		expect(BaseSiCard.getTypeByCardNumber(14999999)).toEqual(FCard);
		expect(BaseSiCard.getTypeByCardNumber(15000000)).not.toEqual(FCard);
	});
	describe('typeSpecificInstanceFromMessage', () => {
		test('works for valid message', () => {
			const instance = FCard.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [0x00, 0x00, ModernSiCardSeries.FCard, 0x11, 0x11, 0x11],
			});
			if (instance === undefined) {
				throw new Error('expect instance');
			}
			expect(instance instanceof FCard).toBe(true);
		});
		test('returns undefined when message has mode', () => {
			expect(FCard.typeSpecificInstanceFromMessage({
				mode: proto.NAK,
			})).toBe(undefined);
		});
		test('returns undefined when message has wrong command', () => {
			expect(FCard.typeSpecificInstanceFromMessage({
				command: testUtils.getRandomByteExcept([proto.cmd.SI8_DET]),
				parameters: [],
			})).toBe(undefined);
		});
		test('returns undefined when there are too few parameters', () => {
			expect(FCard.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [],
			})).toBe(undefined);
		});
		test('returns undefined when the series does not match', () => {
			expect(FCard.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [0x00, 0x00, testUtils.getRandomByteExcept(Object.values(ModernSiCardSeries)), 0x22, 0x22, 0x22],
			})).toBe(undefined);
		});
	});
	test('getPunchOffset', () => {
		expect(getPunchOffset(0)).toEqual(0x88);
		expect(getPunchOffset(1)).toEqual(0x8C);
		expect(getPunchOffset(29)).toEqual(0xFC);
	});
	const examples = getFCardExamples();
	Object.keys(examples).forEach((exampleName) => {
		const { storageData, cardData } = examples[exampleName];
		const myFakeFCard = new FakeFCard(storageData);
		const mainStationSimulation = {
			sendMessage: (message: siProtocol.SiMessage, numResponses?: number) => {
				const responses: siProtocol.SiMessage[] = myFakeFCard.handleRequest(message);
				if (responses.length !== numResponses) {
					throw new Error('Invalid numResponses');
				}
				return Promise.resolve(responses.map(
					(response: siProtocol.SiMessage) => (
						response.mode === undefined ? [0x00, 0x00, ...response.parameters] : []
					),
				));
			},
		};

		test(`typeSpecificRead works with ${exampleName} example`, (done) => {
			const myFCard = new FCard(cardData.cardNumber);
			myFCard.mainStation = mainStationSimulation;
			myFCard.typeSpecificRead().then(() => {
				expect(myFCard.raceResult.cardNumber).toEqual(cardData.cardNumber);
				expect(myFCard.raceResult.startTime).toEqual(cardData.startTime);
				expect(myFCard.raceResult.finishTime).toEqual(cardData.finishTime);
				expect(myFCard.raceResult.checkTime).toEqual(cardData.checkTime);
				expect(myFCard.raceResult.punches).toEqual(cardData.punches);
				expect(myFCard.raceResult.cardHolder).toEqual(cardData.cardHolder);
				expect(myFCard.punchCount).toEqual(cardData.punchCount);
				expect(myFCard.uid).toEqual(cardData.uid);
				done();
			});
		});
	});
	test('typeSpecificRead if typeSpecificGetPage fails', (done) => {
		const testError = new Error('test');
		let attemptedToGetPage = false;
		class FCardFailGetPage extends FCard {
			typeSpecificGetPage() {
				attemptedToGetPage = true;
				return Promise.reject(testError);
			}
		}
		const myFCard = new FCardFailGetPage(14500000);
		myFCard.typeSpecificRead()
			.catch((err) => {
				expect(attemptedToGetPage).toBe(true);
				expect(err).toBe(testError);
				done();
			});
	});
});
