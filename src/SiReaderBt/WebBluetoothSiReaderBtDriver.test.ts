import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import { readerBtCharacteristics, readerBtServices } from './readerBtConstants';
import { DeviceClosedError, SiDeviceState } from './ISiReaderBtDevice';
import { ReaderBtNotFoundError, getWebBluetoothSiReaderBtDriver, isWebBluetoothAvailable } from './WebBluetoothSiReaderBtDriver';

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

/**
 * jsdom has no navigator.bluetooth, so the GATT object graph is stubbed by hand - the
 * same approach WebUsbSiDeviceDriver.test.ts takes for USBDevice.
 */
interface StubCharacteristic {
	uuid: string;
	listeners: EventListener[];
	notificationsStarted: boolean;
	written: Uint8Array[];
	writeMode: string[];
	supportsModernWrites: boolean;
	stopNotificationsFails: boolean;
	addEventListener: (type: string, listener: EventListener) => void;
	removeEventListener: (type: string, listener: EventListener) => void;
	startNotifications: () => Promise<unknown>;
	stopNotifications: () => Promise<unknown>;
	writeValue: (value: Uint8Array) => Promise<void>;
	writeValueWithResponse?: (value: Uint8Array) => Promise<void>;
	writeValueWithoutResponse?: (value: Uint8Array) => Promise<void>;
	notify: (bytes: number[]) => void;
}

const makeCharacteristic = (uuid: string, options: { supportsModernWrites?: boolean; stopNotificationsFails?: boolean } = {}): StubCharacteristic => {
	const characteristic: StubCharacteristic = {
		uuid: uuid,
		listeners: [],
		notificationsStarted: false,
		written: [],
		writeMode: [],
		supportsModernWrites: options.supportsModernWrites ?? true,
		stopNotificationsFails: options.stopNotificationsFails ?? false,
		addEventListener: (_type, listener) => {
			characteristic.listeners.push(listener);
		},
		removeEventListener: (_type, listener) => {
			characteristic.listeners = characteristic.listeners.filter((existing) => existing !== listener);
		},
		startNotifications: () => {
			characteristic.notificationsStarted = true;
			return Promise.resolve();
		},
		stopNotifications: () => {
			if (characteristic.stopNotificationsFails) {
				return Promise.reject(new Error('link is gone'));
			}
			characteristic.notificationsStarted = false;
			return Promise.resolve();
		},
		writeValue: (value) => {
			characteristic.written.push(value);
			characteristic.writeMode.push('legacy');
			return Promise.resolve();
		},
		notify: (bytes) => {
			const value = new DataView(new Uint8Array(bytes).buffer);
			const event = { target: { value: value } } as unknown as Event;
			characteristic.listeners.forEach((listener) => listener(event));
		}
	};
	if (characteristic.supportsModernWrites) {
		characteristic.writeValueWithResponse = (value) => {
			characteristic.written.push(value);
			characteristic.writeMode.push('withResponse');
			return Promise.resolve();
		};
		characteristic.writeValueWithoutResponse = (value) => {
			characteristic.written.push(value);
			characteristic.writeMode.push('withoutResponse');
			return Promise.resolve();
		};
	}
	return characteristic;
};

interface Stubs {
	bluetooth: Bluetooth;
	device: BluetoothDevice;
	characteristics: { [uuid: string]: StubCharacteristic };
	disconnectHandlers: EventListener[];
	gattConnected: () => boolean;
	primaryServiceRequests: string[];
}

const makeStubs = (
	options: { supportsModernWrites?: boolean; stopNotificationsFails?: boolean; noGatt?: boolean; requestDeviceError?: Error; connectError?: Error } = {}
): Stubs => {
	const characteristics: { [uuid: string]: StubCharacteristic } = {};
	Object.values(readerBtCharacteristics).forEach((spec) => {
		characteristics[spec.uuid] = makeCharacteristic(spec.uuid, options);
	});
	const primaryServiceRequests: string[] = [];
	let connected = false;
	const disconnectHandlers: EventListener[] = [];

	const server = {
		get connected() {
			return connected;
		},
		connect: () => {
			if (options.connectError !== undefined) {
				return Promise.reject(options.connectError);
			}
			connected = true;
			return Promise.resolve(server);
		},
		disconnect: () => {
			connected = false;
		},
		getPrimaryService: (uuid: string) => {
			primaryServiceRequests.push(uuid);
			return Promise.resolve({
				getCharacteristic: (characteristicUuid: string) => Promise.resolve(characteristics[characteristicUuid])
			});
		}
	};

	const device = {
		id: 'stub-reader-id',
		name: 'Reader BT 123',
		gatt: options.noGatt ? undefined : server,
		addEventListener: (type: string, listener: EventListener) => {
			if (type === 'gattserverdisconnected') {
				disconnectHandlers.push(listener);
			}
		}
	};

	const bluetooth = {
		requestDevice: () => (options.requestDeviceError ? Promise.reject(options.requestDeviceError) : Promise.resolve(device)),
		getAvailability: () => Promise.resolve(true)
	};

	return {
		bluetooth: bluetooth as unknown as Bluetooth,
		device: device as unknown as BluetoothDevice,
		characteristics: characteristics,
		disconnectHandlers: disconnectHandlers,
		gattConnected: () => connected,
		primaryServiceRequests: primaryServiceRequests
	};
};

describe('WebBluetoothSiReaderBtDriver', () => {
	describe('availability', () => {
		test('reports unavailable without navigator.bluetooth', async () => {
			await expect(getWebBluetoothSiReaderBtDriver(undefined as unknown as Bluetooth).isAvailable()).resolves.toBe(false);
		});

		test('delegates to getAvailability when present', async () => {
			const stubs = makeStubs();
			await expect(getWebBluetoothSiReaderBtDriver(stubs.bluetooth).isAvailable()).resolves.toBe(true);
		});

		test('isWebBluetoothAvailable is false in jsdom', () => {
			expect(isWebBluetoothAvailable()).toBe(false);
		});
	});

	describe('detect', () => {
		test('returns a device identified by its stable BluetoothDevice id', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			expect(device.ident).toEqual('WebBluetoothReaderBt-stub-reader-id');
		});

		test('memoises by ident', async () => {
			const stubs = makeStubs();
			const driver = getWebBluetoothSiReaderBtDriver(stubs.bluetooth);
			expect(await driver.detect()).toBe(await driver.detect());
		});

		test('asks for every service it will later access', async () => {
			const stubs = makeStubs();
			let requested: RequestDeviceOptions | undefined;
			(stubs.bluetooth as unknown as { requestDevice: (o: RequestDeviceOptions) => Promise<BluetoothDevice> }).requestDevice = (options) => {
				requested = options;
				return Promise.resolve(stubs.device);
			};
			await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			// getPrimaryService throws for any service not listed here.
			expect(requested?.optionalServices).toEqual([readerBtServices.settings, readerBtServices.card, readerBtServices.sessions]);
		});

		test('narrows with namePrefix inside the same filter entry, not as a second one', async () => {
			const stubs = makeStubs();
			let requested: RequestDeviceOptions | undefined;
			(stubs.bluetooth as unknown as { requestDevice: (o: RequestDeviceOptions) => Promise<BluetoothDevice> }).requestDevice = (options) => {
				requested = options;
				return Promise.resolve(stubs.device);
			};
			await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect({ namePrefix: 'Reader BT' });
			// A second entry would widen the chooser, since filters are OR-ed.
			const filters = (requested as { filters: { services: string[]; namePrefix?: string }[] }).filters;
			expect(filters).toHaveLength(1);
			expect(filters[0]).toEqual({ services: [readerBtServices.settings], namePrefix: 'Reader BT' });
		});

		test('supports acceptAllDevices as a debugging escape hatch', async () => {
			const stubs = makeStubs();
			let requested: RequestDeviceOptions | undefined;
			(stubs.bluetooth as unknown as { requestDevice: (o: RequestDeviceOptions) => Promise<BluetoothDevice> }).requestDevice = (options) => {
				requested = options;
				return Promise.resolve(stubs.device);
			};
			await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect({ acceptAllDevices: true });
			expect((requested as { acceptAllDevices: boolean }).acceptAllDevices).toBe(true);
		});

		test('turns NotFoundError into advice about the Service/OFF card', async () => {
			const notFound = new Error('User cancelled');
			notFound.name = 'NotFoundError';
			const stubs = makeStubs({ requestDeviceError: notFound });
			const detection = getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await expect(detection).rejects.toBeInstanceOf(ReaderBtNotFoundError);
			await expect(detection).rejects.toThrow('No Reader BT found (User cancelled). Insert the Service/OFF instruction card');
		});

		test('passes other errors through unchanged', async () => {
			const stubs = makeStubs({ requestDeviceError: new Error('boom') });
			await expect(getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect()).rejects.toThrow('boom');
		});
	});

	describe('getExistingDevices', () => {
		test('returns nothing when getDevices is unavailable', async () => {
			const stubs = makeStubs();
			await expect(getWebBluetoothSiReaderBtDriver(stubs.bluetooth).getExistingDevices()).resolves.toEqual([]);
		});

		test('maps the permitted devices when getDevices exists', async () => {
			const stubs = makeStubs();
			(stubs.bluetooth as unknown as { getDevices: () => Promise<BluetoothDevice[]> }).getDevices = () => Promise.resolve([stubs.device]);
			const devices = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).getExistingDevices();
			expect(devices.map((device) => device.ident)).toEqual(['WebBluetoothReaderBt-stub-reader-id']);
		});
	});

	describe('open and subscribe', () => {
		test('connects and subscribes to every notifying characteristic', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();

			expect(device.state).toEqual(SiDeviceState.Opened);
			expect(stubs.gattConnected()).toBe(true);
			expect(stubs.characteristics[readerBtCharacteristics.cardState.uuid].notificationsStarted).toBe(true);
			expect(stubs.characteristics[readerBtCharacteristics.cardData.uuid].notificationsStarted).toBe(true);
			expect(stubs.characteristics[readerBtCharacteristics.readSettings.uuid].notificationsStarted).toBe(true);
			// writeSettings does not notify, so it is not subscribed.
			expect(stubs.characteristics[readerBtCharacteristics.writeSettings.uuid].notificationsStarted).toBe(false);
		});

		test('turns a reconnect to a silent reader into advice about the Service/OFF card', async () => {
			// as Chrome rejects gatt.connect() after the reader dropped the link
			const notInRange = new Error('Bluetooth Device is no longer in range.');
			notInRange.name = 'NetworkError';
			const stubs = makeStubs({ connectError: notInRange });
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			const opening = device.open();
			await expect(opening).rejects.toBeInstanceOf(ReaderBtNotFoundError);
			await expect(opening).rejects.toThrow('The Reader BT is not advertising (Bluetooth Device is no longer in range.)');
			expect(device.state).toEqual(SiDeviceState.Closed);
		});

		test('passes other connect errors through unchanged', async () => {
			const stubs = makeStubs({ connectError: new Error('GATT operation failed') });
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await expect(device.open()).rejects.toThrow('GATT operation failed');
		});

		test('rejects a device with no GATT server', async () => {
			const stubs = makeStubs({ noGatt: true });
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await expect(device.open()).rejects.toBeInstanceOf(DeviceClosedError);
		});

		test('turns a characteristic notification into a notify event', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();

			const received: { characteristic: string; uint8Data: number[] }[] = [];
			device.addEventListener('notify', (event) => received.push({ characteristic: event.characteristic, uint8Data: event.uint8Data }));
			stubs.characteristics[readerBtCharacteristics.cardState.uuid].notify([0x01, 0x11, 0x00, 0x00]);

			expect(received).toEqual([{ characteristic: 'cardState', uint8Data: [0x01, 0x11, 0x00, 0x00] }]);
		});

		test('ignores a notification that carries no value', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();
			const received: string[] = [];
			device.addEventListener('notify', (event) => received.push(event.characteristic));

			const characteristic = stubs.characteristics[readerBtCharacteristics.cardState.uuid];
			characteristic.listeners.forEach((listener) => listener({ target: { value: undefined } } as unknown as Event));

			expect(received).toEqual([]);
		});

		test('caches handles so a second write does not re-walk the services', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();
			const afterOpen = stubs.primaryServiceRequests.length;
			await device.write('cardData', [1, 2, 3]);
			expect(stubs.primaryServiceRequests.length).toEqual(afterOpen);
		});

		test('rejects a write when the server is not connected', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await expect(device.write('cardData', [1, 2, 3])).rejects.toBeInstanceOf(DeviceClosedError);
		});
	});

	describe('write', () => {
		test('prefers writeValueWithResponse and writeValueWithoutResponse', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();
			await device.write('cardData', [1, 2], true);
			await device.write('cardData', [3, 4], false);
			expect(stubs.characteristics[readerBtCharacteristics.cardData.uuid].writeMode).toEqual(['withResponse', 'withoutResponse']);
		});

		test('falls back to the deprecated writeValue on older Chrome', async () => {
			const stubs = makeStubs({ supportsModernWrites: false });
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();
			await device.write('cardData', [1, 2], true);
			await device.write('cardData', [3, 4], false);
			expect(stubs.characteristics[readerBtCharacteristics.cardData.uuid].writeMode).toEqual(['legacy', 'legacy']);
		});
	});

	describe('disconnect', () => {
		test('gattserverdisconnected closes the device and drops the stale handles', async () => {
			const stubs = makeStubs();
			const driver = getWebBluetoothSiReaderBtDriver(stubs.bluetooth);
			const device = await driver.detect();
			await device.open();

			stubs.disconnectHandlers.forEach((handler) => handler({} as Event));

			expect(device.state).toEqual(SiDeviceState.Closed);
			// Handles do not survive a reconnect, so they must have been cleared.
			expect(device.data.characteristics).toEqual({});
			expect(device.data.server).toBeUndefined();
		});

		test('reconnecting re-walks the services', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();
			const afterFirstOpen = stubs.primaryServiceRequests.length;

			stubs.disconnectHandlers.forEach((handler) => handler({} as Event));
			await device.open();

			expect(stubs.primaryServiceRequests.length).toBeGreaterThan(afterFirstOpen);
			expect(device.state).toEqual(SiDeviceState.Opened);
		});

		test('close unsubscribes and disconnects', async () => {
			const stubs = makeStubs();
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();
			await device.close();

			expect(stubs.gattConnected()).toBe(false);
			expect(stubs.characteristics[readerBtCharacteristics.cardState.uuid].notificationsStarted).toBe(false);
			expect(stubs.characteristics[readerBtCharacteristics.cardState.uuid].listeners).toEqual([]);
		});

		test('close tolerates a link that has already gone', async () => {
			const stubs = makeStubs({ stopNotificationsFails: true });
			const device = await getWebBluetoothSiReaderBtDriver(stubs.bluetooth).detect();
			await device.open();
			await expect(device.close()).resolves.toBe(device);
		});

		test('unsubscribing a characteristic that was never subscribed is a no-op', async () => {
			const stubs = makeStubs();
			const driver = getWebBluetoothSiReaderBtDriver(stubs.bluetooth);
			const device = await driver.detect();
			await expect(driver.unsubscribe(device, 'writeSettings')).resolves.toBeUndefined();
		});

		test('forgetSiDevice drops the memoised device', async () => {
			const stubs = makeStubs();
			const driver = getWebBluetoothSiReaderBtDriver(stubs.bluetooth);
			const device = await driver.detect();
			driver.forgetSiDevice(device);
			expect(await driver.detect()).not.toBe(device);
		});
	});
});
