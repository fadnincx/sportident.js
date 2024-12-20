import { describe, expect, test } from '@jest/globals';
import { proto } from '../../../constants';
import * as utils from '../../../utils';
import * as testUtils from '../../../testUtils';
import { FakeModernSiCard } from './FakeModernSiCard';
import { getEmptyCard } from '../../../SiCard/types/modernSiCardExamples';

testUtils.useFakeTimers();

describe('FakeModernSiCard', () => {
	test('exists', () => {
		expect(FakeModernSiCard).not.toBe(undefined);
	});
	const testData = getEmptyCard();
	const myFakeModernSiCard = new FakeModernSiCard(testData.storageData);
	test('handleDetect works', () => {
		expect(myFakeModernSiCard.handleDetect()).toEqual({
			command: proto.cmd.SI8_DET,
			parameters: utils.unPrettyHex('00 6B 96 8C')
		});
	});
	test('handleRequest works', () => {
		expect(() =>
			myFakeModernSiCard.handleRequest({
				command: proto.cmd.GET_SI5,
				parameters: [0x06]
			})
		).toThrow();

		expect(
			myFakeModernSiCard.handleRequest({
				command: proto.cmd.GET_SI8,
				parameters: [0x06]
			})
		).toEqual([
			{
				command: proto.cmd.GET_SI8,
				parameters: [6, ...testData.storageData.slice(6 * 128, 7 * 128)]
			}
		]);

		expect(
			myFakeModernSiCard.handleRequest({
				command: proto.cmd.GET_SI8,
				parameters: [0x08]
			})
		).toEqual([
			{
				command: proto.cmd.GET_SI8,
				parameters: [0, ...testData.storageData.slice(0, 128)]
			},
			{
				command: proto.cmd.GET_SI8,
				parameters: [6, ...testData.storageData.slice(6 * 128, 7 * 128)]
			},
			{
				command: proto.cmd.GET_SI8,
				parameters: [7, ...testData.storageData.slice(7 * 128, 8 * 128)]
			}
		]);
	});
});
