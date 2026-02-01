import { describe, expect, test } from '@jest/globals';
import { proto } from '../../constants';
import type * as siProtocol from '../../siProtocol';
import * as testUtils from '../../testUtils';
import { BaseSiCard } from '../BaseSiCard';
import { SIAC } from './SIAC';

describe('SIAC', () => {
	test('is registered', () => {
		expect(BaseSiCard.getTypeByCardNumber(7999999)).not.toEqual(SIAC);
		expect(BaseSiCard.getTypeByCardNumber(8000000)).toEqual(SIAC);
		expect(BaseSiCard.getTypeByCardNumber(8999999)).toEqual(SIAC);
		expect(BaseSiCard.getTypeByCardNumber(9000000)).not.toEqual(SIAC);
	});
	describe('typeSpecificInstanceFromMessage', () => {
		test('works for valid message', () => {
			const instance = SIAC.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [0x00, 0x00, 0x0f, 0x88, 0x88, 0x88]  // SI3=0x0F for SIAC
			});
			if (instance === undefined) {
				throw new Error('expect instance');
			}
			expect(instance instanceof SIAC).toBe(true);
			expect(instance.cardNumber).toBe(8947848);
		});
		test('returns undefined when message has mode', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					mode: proto.NAK
				})
			).toBe(undefined);
		});
		test('returns undefined when message has wrong command', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					command: testUtils.getRandomByteExcept([proto.cmd.SI8_DET]),
					parameters: []
				})
			).toBe(undefined);
		});
		test('returns undefined when there are too few parameters', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					command: proto.cmd.SI8_DET,
					parameters: []
				})
			).toBe(undefined);
		});
		test('returns undefined when the card number does not match', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					command: proto.cmd.SI8_DET,
					parameters: [0x00, 0x00, 0x0f, 0x77, 0x77, 0x77]  // SI3=0x0F but card number 7829367 is SiCard10 range
				})
			).toBe(undefined);
		});
	});
	test('is modern', (done) => {
		const mySIAC = new SIAC(8500000);
		mySIAC.mainStation = {
			sendMessage: (message: siProtocol.SiMessage, numResponses?: number) => {
				if (message.mode !== undefined) {
					return Promise.reject(new Error('message mode is not undefined'));
				}
				const { command, parameters } = message;
				expect(command).toBe(proto.cmd.GET_SI8);
				expect(numResponses).toBe(1);
				const pageNumberToGet = parameters[0];
				const getPage = (pageNumber: number) => [...[0x00, 0x00, pageNumber], ...Array.from({length: 128}, (_, i) => i).map(() => 0)];
				return Promise.resolve([getPage(pageNumberToGet)]);
			}
		};
		mySIAC.typeSpecificRead().then(() => {
			expect(mySIAC.raceResult.cardNumber).toBe(0);
			expect(JSON.stringify(mySIAC.raceResult.startTime)).toBe(JSON.stringify({"time":0,"weekcounter":0,"weekday":0}));
			expect(JSON.stringify(mySIAC.raceResult.finishTime)).toBe(JSON.stringify({"time":0,"weekcounter":0,"weekday":0}));
			expect(mySIAC.raceResult.punches).toEqual([]);
			expect(mySIAC.punchCount).toBe(0);
			done();
		});
	});
});
