import { expect, test } from '@jest/globals';
import { msg, readerBtNotifyCharacteristicIds } from '../readerBtConstants';
import { parseAllMessages, renderRequest, renderMessage } from '../readerBtProtocol';
import { SiDeviceState, SiReaderBtDeviceNotifyEvent } from '../ISiReaderBtDevice';
import type { ISiReaderBtDevice, ISiReaderBtDriverData } from '../ISiReaderBtDevice';
import type { ISiReaderBtDriver } from '../ISiReaderBtDriver';

/**
 * Conformance suite every ISiReaderBtDriver implementation should pass.
 *
 * Lives under testUtils/ which jest.config.ts excludes from both testPathIgnorePatterns
 * and coveragePathIgnorePatterns, so it costs nothing in coverage. Mirrors
 * SiDevice/testUtils/testISiDeviceDriver.ts.
 */
export const testISiReaderBtDriver = <T extends ISiReaderBtDriverData<ISiReaderBtDriver<T>>>(
	getDevice: () => Promise<ISiReaderBtDevice<T>>,
	/** Makes the device deliver one notification on the given characteristic. */
	simulateNotification: (device: ISiReaderBtDevice<T>, uint8Data: number[]) => void
): void => {
	test('ISiReaderBtDriver conformance', async () => {
		const device = await getDevice();
		expect(device.name).not.toEqual('');
		expect(device.ident).not.toEqual('');
		expect(device.state).toEqual(SiDeviceState.Closed);

		await device.open();
		expect(device.state).toEqual(SiDeviceState.Opened);

		// Opening must subscribe to every notifying characteristic, or responses would
		// never arrive.
		const received: SiReaderBtDeviceNotifyEvent[] = [];
		device.addEventListener('notify', (event) => received.push(event));

		const notification = renderMessage({ messageId: msg.CARD_STATE_CHANGE, payload: [1, 2, 3, 4, 1, 0, 0] });
		simulateNotification(device, notification);
		await Promise.resolve();

		expect(received.length).toBeGreaterThan(0);
		expect(readerBtNotifyCharacteristicIds).toContain(received[0].characteristic);
		expect(parseAllMessages(received[0].uint8Data).messages[0].messageId).toEqual(msg.CARD_STATE_CHANGE);

		await device.write('cardData', renderMessage(renderRequest(msg.CARD_READOUT_COMPLETE)), true);

		await device.close();
		expect(device.state).toEqual(SiDeviceState.Closed);
	});
};
