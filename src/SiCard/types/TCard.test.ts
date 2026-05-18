import { describe, expect, test } from '@jest/globals';
import { BaseSiCard } from '../BaseSiCard';
import { getPunchOffset, TCard } from './TCard';
import { proto } from '../../constants';
import * as siProtocol from '../../siProtocol';
import * as testUtils from '../../testUtils';
import { ModernSiCardSeries } from './ModernSiCard';
import { getTCardExamples } from './tCardExamples';
import { FakeTCard } from '../../fakes/FakeSiCard/types/FakeTCard';

describe('TCard', () => {
	test('is registered', () => {
		expect(BaseSiCard.getTypeByCardNumber(5999999)).not.toEqual(TCard);
		expect(BaseSiCard.getTypeByCardNumber(6000000)).toEqual(TCard);
		expect(BaseSiCard.getTypeByCardNumber(6999999)).toEqual(TCard);
		expect(BaseSiCard.getTypeByCardNumber(7000000)).not.toEqual(TCard);
	});
	describe('typeSpecificInstanceFromMessage', () => {
		test('works for valid message', () => {
			const instance = TCard.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [0x00, 0x00, ModernSiCardSeries.TCard, 0x11, 0x11, 0x11],
			});
			if (instance === undefined) {
				throw new Error('expect instance');
			}
			expect(instance instanceof TCard).toBe(true);
		});
		test('returns undefined when message has mode', () => {
			expect(TCard.typeSpecificInstanceFromMessage({
				mode: proto.NAK,
			})).toBe(undefined);
		});
		test('returns undefined when message has wrong command', () => {
			expect(TCard.typeSpecificInstanceFromMessage({
				command: testUtils.getRandomByteExcept([proto.cmd.SI8_DET]),
				parameters: [],
			})).toBe(undefined);
		});
		test('returns undefined when there are too few parameters', () => {
			expect(TCard.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [],
			})).toBe(undefined);
		});
		test('returns undefined when the series does not match', () => {
			expect(TCard.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [0x00, 0x00, testUtils.getRandomByteExcept(Object.values(ModernSiCardSeries)), 0x22, 0x22, 0x22],
			})).toBe(undefined);
		});
	});
	test('getPunchOffset', () => {
		expect(getPunchOffset(0)).toEqual(0x38);
		expect(getPunchOffset(1)).toEqual(0x3C);
		expect(getPunchOffset(8)).toEqual(0x58);
		expect(getPunchOffset(9)).toEqual(0x80);
		expect(getPunchOffset(10)).toEqual(0x84);
	});
	const examples = getTCardExamples();
	Object.keys(examples).forEach((exampleName) => {
		const { storageData, cardData } = examples[exampleName];
		const myFakeTCard = new FakeTCard(storageData);
		const mainStationSimulation = {
			sendMessage: (message: siProtocol.SiMessage, numResponses?: number) => {
				const responses: siProtocol.SiMessage[] = myFakeTCard.handleRequest(message);
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
			const myTCard = new TCard(cardData.cardNumber);
			myTCard.mainStation = mainStationSimulation;
			myTCard.typeSpecificRead().then(() => {
				expect(myTCard.raceResult.cardNumber).toEqual(cardData.cardNumber);
				expect(myTCard.raceResult.startTime).toEqual(cardData.startTime);
				expect(myTCard.raceResult.finishTime).toEqual(cardData.finishTime);
				expect(myTCard.raceResult.checkTime).toEqual(cardData.checkTime);
				expect(myTCard.raceResult.punches).toEqual(cardData.punches);
				expect(myTCard.raceResult.cardHolder).toEqual(cardData.cardHolder);
				expect(myTCard.punchCount).toEqual(cardData.punchCount);
				expect(myTCard.uid).toEqual(cardData.uid);
				done();
			});
		});
	});
	test('typeSpecificRead if typeSpecificGetPage fails', (done) => {
		const testError = new Error('test');
		let attemptedToGetPage = false;
		class TCardFailGetPage extends TCard {
			typeSpecificGetPage() {
				attemptedToGetPage = true;
				return Promise.reject(testError);
			}
		}
		const myTCard = new TCardFailGetPage(6500000);
		myTCard.typeSpecificRead()
			.catch((err) => {
				expect(attemptedToGetPage).toBe(true);
				expect(err).toBe(testError);
				done();
			});
	});
});
