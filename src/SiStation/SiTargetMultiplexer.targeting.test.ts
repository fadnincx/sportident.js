import { describe, expect, test } from '@jest/globals';
import { proto } from '../constants';
import * as siProtocol from '../siProtocol';
import * as testUtils from '../testUtils';
import { SiDevice } from '../SiDevice/SiDevice';
import { SiDeviceState, SiDeviceReceiveEvent, type ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import type { ISiDeviceDriver } from '../SiDevice/ISiDeviceDriver';
import { SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';
import { SiTargetMultiplexer } from './SiTargetMultiplexer';

testUtils.useFakeTimers();

function mockDriver(driver: Partial<ISiDeviceDriver<ISiDeviceDriverData<unknown>>>) {
	return driver as unknown as ISiDeviceDriver<ISiDeviceDriverData<unknown>>;
}

describe('SiTargetMultiplexer', () => {
	test('handles targeting', async () => {
		const siDevice = new SiDevice('handlesTargeting0', {
			driver: mockDriver({
				send: () => Promise.resolve()
			})
		});
		siDevice.setState(SiDeviceState.Opened);
		const muxer = SiTargetMultiplexer.fromSiDevice(siDevice);
		expect(muxer instanceof SiTargetMultiplexer).toBe(true);

		const randomMessage = testUtils.getRandomMessage({});
		const timeState = {
			sendingFinished: false,
			resendingFinished: false,
			remoteSendingFinished: false
		};
		const firstSendPromise = muxer.sendMessage(SiTargetMultiplexerTarget.Direct, randomMessage, 0, 100);

		// Allow the scheduled SET_MS command to be processed
		await testUtils.advanceTimersByTime(1);

		// Now provide the SET_MS response
		siDevice.dispatchEvent(
			'receive',
			new SiDeviceReceiveEvent(
				siDevice,
				siProtocol.render({
					command: proto.cmd.SET_MS,
					parameters: [0x00, 0x00, proto.P_MS_DIRECT]
				})
			)
		);

		expect(muxer.target).toBe(SiTargetMultiplexerTarget.Unknown);
		expect(muxer._test.latestTarget).toBe(SiTargetMultiplexerTarget.Direct);

		// Allow the SET_MS response to be processed and next queue item
		await testUtils.advanceTimersByTime(1);
		expect(muxer.target).toBe(SiTargetMultiplexerTarget.Direct);
		expect(muxer._test.latestTarget).toBe(SiTargetMultiplexerTarget.Direct);

		// Wait for the first sendMessage to complete
		const firstResponses = await firstSendPromise;
		expect(firstResponses.length).toBe(0);
		expect(muxer._test.sendQueue.length).toBe(0);
		timeState.sendingFinished = true;

		const secondSendPromise = muxer.sendMessage(SiTargetMultiplexerTarget.Direct, randomMessage, 0, 100);
		await testUtils.advanceTimersByTime(1);

		// Wait for the second sendMessage to complete
		const secondResponses = await secondSendPromise;
		expect(secondResponses.length).toBe(0);
		expect(muxer._test.sendQueue.length).toBe(0);
		timeState.resendingFinished = true;
		expect(muxer.target).toBe(SiTargetMultiplexerTarget.Direct);
		expect(muxer._test.latestTarget).toBe(SiTargetMultiplexerTarget.Direct);
		expect(timeState).toEqual({
			sendingFinished: true,
			resendingFinished: true,
			remoteSendingFinished: false
		});

		const thirdSendPromise = muxer.sendMessage(SiTargetMultiplexerTarget.Remote, randomMessage, 0, 100);

		// Allow the scheduled SET_MS command for Remote target to be processed
		await testUtils.advanceTimersByTime(1);

		// Now provide the SET_MS response for Remote
		siDevice.dispatchEvent(
			'receive',
			new SiDeviceReceiveEvent(
				siDevice,
				siProtocol.render({
					command: proto.cmd.SET_MS,
					parameters: [0x00, 0x00, proto.P_MS_REMOTE]
				})
			)
		);

		expect(muxer.target).toBe(SiTargetMultiplexerTarget.Direct);
		expect(muxer._test.latestTarget).toBe(SiTargetMultiplexerTarget.Remote);

		// Allow the SET_MS response to be processed and next queue item
		await testUtils.advanceTimersByTime(1);
		expect(muxer.target).toBe(SiTargetMultiplexerTarget.Remote);
		expect(muxer._test.latestTarget).toBe(SiTargetMultiplexerTarget.Remote);

		// Wait for the third sendMessage to complete
		const thirdResponses = await thirdSendPromise;
		expect(thirdResponses.length).toBe(0);
		expect(muxer._test.sendQueue.length).toBe(0);
		timeState.remoteSendingFinished = true;
		expect(timeState).toEqual({
			sendingFinished: true,
			resendingFinished: true,
			remoteSendingFinished: true
		});
	});
});
