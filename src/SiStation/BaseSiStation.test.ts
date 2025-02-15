import { describe, expect, test } from '@jest/globals';
import type * as siProtocol from '../siProtocol';
import * as testUtils from '../testUtils';
import { proto } from '../constants';
import { SiDataType } from '../storage';
import { type ISiTargetMultiplexer, SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';
import { BaseSiStation } from './BaseSiStation';
import { getSiStationExamples } from './siStationExamples';

testUtils.useFakeTimers();

describe('SiStation', () => {
	class MySiStation extends BaseSiStation<SiTargetMultiplexerTarget.Direct> {}

	test('SiStation info', async () => {
		const mySiStation = new MySiStation({} as unknown as ISiTargetMultiplexer, SiTargetMultiplexerTarget.Direct);
		interface MessageRecord {
			target: SiTargetMultiplexerTarget;
			command: number | undefined;
			parameters: number[] | undefined;
			numResponses: number | undefined;
		}
		const messagesSent: MessageRecord[] = [];
		mySiStation.siTargetMultiplexer = {
			sendMessage: (target, message, numResponses) => {
				const command = message.mode === undefined ? message.command : undefined;
				const parameters = message.mode === undefined ? message.parameters : undefined;
				messagesSent.push({
					target: target,
					command: command,
					parameters: parameters,
					numResponses: numResponses
				});
				if (command === proto.cmd.GET_SYS_VAL) {
					return Promise.resolve([[0x00, 0x00, 0x00, ...Array.from({length: 128}, (_, i) => i)]]);
				}
				if (command === proto.cmd.SET_SYS_VAL) {
					return Promise.resolve([[0x00, 0x00, 0x72]]);
				}
				throw new Error();
			}
		} as ISiTargetMultiplexer;
		const timeState = { infoHasBeenRead: false, changesHaveBeenWritten: false };
		mySiStation.readInfo().then(() => {
			timeState.infoHasBeenRead = true;
		});
		expect(mySiStation.storage.data.toJS()).toEqual(Array.from({length: 128}, (_, i) => i).map(() => undefined));
		expect(mySiStation.getField('code') instanceof SiDataType).toBe(true);
		expect(mySiStation.getInfo('code')).toBe(undefined);

		await testUtils.advanceTimersByTime(0);
		expect(messagesSent).toEqual([
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.GET_SYS_VAL,
				numResponses: 1,
				parameters: [0, 128]
			}
		]);
		expect(timeState).toEqual({ infoHasBeenRead: true, changesHaveBeenWritten: false });
		expect(mySiStation.storage.data.toJS()).toEqual(Array.from({length: 128}, (_, i) => i));
		expect(mySiStation.getInfo('code')).not.toBe(undefined);
		expect(mySiStation.setInfo('code', 0)).toBe(undefined);
		expect(mySiStation.getInfo('code')!.value).toBe(0);
		mySiStation.writeChanges().then(() => {
			timeState.changesHaveBeenWritten = true;
		});

		await testUtils.nTimesAsync(2, () => testUtils.advanceTimersByTime(0));
		expect(messagesSent).toEqual([
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.GET_SYS_VAL,
				numResponses: 1,
				parameters: [0, 128]
			},
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.GET_SYS_VAL,
				numResponses: 1,
				parameters: [0, 128]
			},
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.SET_SYS_VAL,
				numResponses: 1,
				parameters: [0x72, 0x00, 0x33]
			}
		]);
		expect(timeState).toEqual({ infoHasBeenRead: true, changesHaveBeenWritten: true });
		mySiStation.atomically(() => {
			mySiStation.setInfo('code', 10);
		});

		await testUtils.nTimesAsync(2, () => testUtils.advanceTimersByTime(0));
		expect(messagesSent).toEqual([
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.GET_SYS_VAL,
				numResponses: 1,
				parameters: [0, 128]
			},
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.GET_SYS_VAL,
				numResponses: 1,
				parameters: [0, 128]
			},
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.SET_SYS_VAL,
				numResponses: 1,
				parameters: [0x72, 0x00, 0x33]
			},
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.GET_SYS_VAL,
				numResponses: 1,
				parameters: [0, 128]
			},
			{
				target: SiTargetMultiplexerTarget.Direct,
				command: proto.cmd.SET_SYS_VAL,
				numResponses: 1,
				parameters: [0x72, 0x0a, 0x33]
			}
		]);
		expect(mySiStation.getInfo('code')!.value).toBe(10);
	});
	const examples = getSiStationExamples();
	Object.keys(examples).forEach((exampleName) => {
		const { storageData, stationData } = examples[exampleName];
		test(`works with ${exampleName} example`, (done) => {
			const mySiStation = new MySiStation(
				{
					sendMessage: (_target: SiTargetMultiplexerTarget, message: siProtocol.SiMessage, numResponses: number) => {
						if (message.mode !== undefined) {
							return Promise.resolve([]);
						}
						const { command, parameters } = message;
						if (command === proto.cmd.GET_SYS_VAL) {
							const getRange = (offset: number, length: number) => [...[0x00, 0x00, offset], ...storageData.slice(offset, offset + length)];
							if (numResponses !== 1) {
								throw new Error(`Invalid numResponses ${numResponses} (expected 1)`);
							}
							return Promise.resolve([getRange(parameters![0]!, parameters![1]!)]);
						}
						return Promise.resolve([]);
					}
				} as unknown as ISiTargetMultiplexer,
				SiTargetMultiplexerTarget.Direct
			);
			mySiStation.readInfo().then(() => {
				Object.keys(stationData).forEach((stationDataKey) => {
					// @ts-ignore
					expect(mySiStation.getInfo(stationDataKey)!.value).toEqual(stationData[stationDataKey]);
				});
				done();
			});
		});
	});

	test('get/set time', async () => {
		const mySiStation = new MySiStation(
			{
				sendMessage: () => Promise.resolve([[0x00, 0x00, 0x01, 0x0c, 0x1f, 0x00, 0xa8, 0xbf, 0x40]])
			} as unknown as ISiTargetMultiplexer,
			SiTargetMultiplexerTarget.Direct
		);
		const timeState: { [key: string]: Date | undefined } = {
			retrievedTime: undefined,
			setTime: undefined
		};
		mySiStation.getTime().then((time) => {
			timeState.retrievedTime = time;
		});
		await testUtils.nTimesAsync(1, () => testUtils.advanceTimersByTime(0));
		expect(timeState.retrievedTime instanceof Date).toBe(true);

		mySiStation.setTime(new Date()).then((time) => {
			timeState.setTime = time;
		});
		await testUtils.nTimesAsync(1, () => testUtils.advanceTimersByTime(0));
		expect(timeState.setTime instanceof Date).toBe(true);
	});
	test('signal', async () => {
		const mySiStation = new MySiStation(
			{
				sendMessage: () => Promise.resolve([[0x00, 0x00, 0x02]])
			} as unknown as ISiTargetMultiplexer,
			SiTargetMultiplexerTarget.Direct
		);
		const timeState = { signalTwiceSucceeded: false, signalOnceFailed: false };
		mySiStation.signal(2).then(() => {
			timeState.signalTwiceSucceeded = true;
		});
		await testUtils.nTimesAsync(1, () => testUtils.advanceTimersByTime(0));
		expect(timeState).toEqual({ signalTwiceSucceeded: true, signalOnceFailed: false });

		mySiStation.signal(1).catch(() => {
			timeState.signalOnceFailed = true;
		});
		await testUtils.nTimesAsync(1, () => testUtils.advanceTimersByTime(0));
		expect(timeState).toEqual({ signalTwiceSucceeded: true, signalOnceFailed: true });
	});
	test('powerOff', async () => {
		const mySiStation = new MySiStation(
			{
				sendMessage: () => Promise.resolve()
			} as unknown as ISiTargetMultiplexer,
			SiTargetMultiplexerTarget.Direct
		);
		const timeState = { powerOffSucceeded: false };
		mySiStation.powerOff().then(() => {
			timeState.powerOffSucceeded = true;
		});
		await testUtils.nTimesAsync(1, () => testUtils.advanceTimersByTime(0));
		expect(timeState).toEqual({ powerOffSucceeded: true });
	});
});
