import * as utils from '../utils';
import { DeviceClosedError, SiDeviceState } from '../SiDevice/ISiDevice';
import type { ISiDevice, ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import { SiDeviceAddEvent, SiDeviceRemoveEvent } from '../SiDevice/ISiDeviceDriver';
import type { ISiDeviceDriver, ISiDeviceDriverWithAutodetection, ISiDeviceDriverWithDetection, SiDeviceDriverWithAutodetectionEvents } from '../SiDevice/ISiDeviceDriver';
import { SiDevice } from '../SiDevice/SiDevice';

const logger = utils.getLogger('WebUsbDriver');

const siConfiguration = 1;
const siAlternate = 0;
const siPacketSize = 64;
const siUsbClassCode = 255;
const siDeviceFilters = [{ vendorId: 0x10c4, productId: 0x800a }];
const matchesSiDeviceFilters = (vendorId: number, productId: number) => siDeviceFilters.some((filter) => vendorId === filter.vendorId && productId === filter.productId);

const getIdent = (device: USBDevice) => `${device.serialNumber}`;

function findEndpoint(iface: USBInterface, direction: USBDirection): USBEndpoint {
	const alternate = iface.alternates[0];
	for (const endpoint of alternate.endpoints) {
		if (endpoint.direction == direction) {
			return endpoint;
		}
	}
	throw new TypeError(`Interface ${iface.interfaceNumber} does not have an ` + `${direction} endpoint.`);
}
function findInterface(device: USBDevice): USBInterface {
	const configuration = device.configurations[0];
	for (const iface of configuration.interfaces) {
		const alternate = iface.alternates[0];
		if (alternate.interfaceClass === siUsbClassCode) {
			return iface;
		}
	}
	throw new TypeError(`Unable to find interface with class ${siUsbClassCode}.`);
}
export interface WebUsbSiDeviceDriverData extends ISiDeviceDriverData<WebUsbSiDeviceDriver> {
	driver: WebUsbSiDeviceDriver;
	device: USBDevice;
}

interface WebUsbAutodetectionCallbacks {
	onConnect: utils.EventCallback<USBConnectionEvent>;
	onDisconnect: utils.EventCallback<USBConnectionEvent>;
}

export type IWebUsbSiDevice = ISiDevice<WebUsbSiDeviceDriverData>;
export type WebUsbSiDevice = SiDevice<WebUsbSiDeviceDriverData>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WebUsbSiDeviceDriver
	implements ISiDeviceDriver<WebUsbSiDeviceDriverData>, ISiDeviceDriverWithDetection<WebUsbSiDeviceDriverData, []>, ISiDeviceDriverWithAutodetection<WebUsbSiDeviceDriverData>
{
	public name = 'WebUSB';

	private siDeviceByIdent: { [ident: string]: WebUsbSiDevice } = {};

	private autodetectedSiDevices: { [ident: string]: WebUsbSiDevice } = {};

	private autodetectionCallbacks?: WebUsbAutodetectionCallbacks;

	constructor(private navigatorUsb: USB) {}

	detect(): Promise<WebUsbSiDevice> {
		return this.navigatorUsb
			.requestDevice({
				filters: siDeviceFilters
			})
			.catch((e) => {
				return Promise.reject(new Error('Failed to get access to USB device! ' + e.toString()));
			})
			.then((navigatorWebUsbDevice: USBDevice) => this.autodetectSiDevice(navigatorWebUsbDevice))
			.catch((e) => {
				return Promise.reject(new Error('Failed to initialize Si Device! ' + e.toString()));
			});
	}
	
	getExistingDevices(): Promise<WebUsbSiDevice[]> {
		return Promise.resolve(Object.values(this.autodetectedSiDevices))
	}

	getSiDevice(navigatorWebUsbDevice: USBDevice): WebUsbSiDevice {
		const ident = getIdent(navigatorWebUsbDevice);
		if (this.siDeviceByIdent[ident] !== undefined) {
			return this.siDeviceByIdent[ident];
		}
		const newSiDeviceData: WebUsbSiDeviceDriverData = {
			driver: this,
			device: navigatorWebUsbDevice
		};
		const newSiDevice = new SiDevice(ident, newSiDeviceData);
		this.siDeviceByIdent[ident] = newSiDevice;
		return newSiDevice;
	}

	forgetSiDevice(siDevice: IWebUsbSiDevice) {
		const navigatorWebUsbDevice = siDevice.data.device;
		const ident = getIdent(navigatorWebUsbDevice);
		delete this.siDeviceByIdent[ident];
		if (this.autodetectedSiDevices[ident] !== undefined) {
			this.dispatchEvent('remove', new SiDeviceRemoveEvent(siDevice));
		}
		delete this.autodetectedSiDevices[ident];
	}

	startAutoDetection(): Promise<IWebUsbSiDevice[]> {
		this.registerAutodetectionCallbacks();
		return this.getAutodetectedDevices();
	}

	getAutodetectedDevices(): Promise<WebUsbSiDevice[]> {
		return this.navigatorUsb.getDevices().then((navigatorWebUsbDevices: USBDevice[]) => this.autodetectSiDevices(navigatorWebUsbDevices));
	}

	autodetectSiDevices(navigatorWebUsbDevices: USBDevice[]): Promise<WebUsbSiDevice[]> {
		// TODO: Make this easier when Promise.allSettled polyfill is available
		return new Promise((resolve) => {
			let numSettled = 0;
			const devices: WebUsbSiDevice[] = [];
			const onSettled = () => {
				numSettled += 1;
				if (numSettled === navigatorWebUsbDevices.length) {
					resolve(devices);
				}
			};
			navigatorWebUsbDevices.forEach((navigatorWebUsbDevice: USBDevice) =>
				this.autodetectSiDevice(navigatorWebUsbDevice)
					.then((siDevice: WebUsbSiDevice) => {
						devices.push(siDevice);
						onSettled();
					})
					.catch(() => onSettled())
			);
		});
	}

	autodetectSiDevice(navigatorWebUsbDevice: USBDevice): Promise<WebUsbSiDevice> {
		if (!matchesSiDeviceFilters(navigatorWebUsbDevice.vendorId, navigatorWebUsbDevice.productId)) {
			return Promise.reject(new Error('Not a SI device'));
		}
		const ident = getIdent(navigatorWebUsbDevice);
		if (this.autodetectedSiDevices[ident] !== undefined) {
			return Promise.reject(new Error('Duplicate SI device'));
		}
		const siDevice = this.getSiDevice(navigatorWebUsbDevice);
		this.autodetectedSiDevices[ident] = siDevice;
		return siDevice.open();
	}

	registerAutodetectionCallbacks(): void {
		if (this.autodetectionCallbacks !== undefined) {
			return;
		}
		const onConnectCallback = (event: USBConnectionEvent) => {
			const navigatorWebUsbDevice = event.device;
			this.autodetectSiDevice(navigatorWebUsbDevice)
			.then((openedDevice: WebUsbSiDevice) => {
				this.dispatchEvent('add', new SiDeviceAddEvent(openedDevice));
			})
			.catch(err => {
				logger.warn(`Auto-detection failed for connected device`, { error: String(err) });
			});
		};
		this.navigatorUsb.addEventListener('connect', onConnectCallback);
		const onDisconnectCallback = (event: USBConnectionEvent) => {
			const navigatorWebUsbDevice = event.device;
			const ident = getIdent(navigatorWebUsbDevice);
			const siDevice = this.siDeviceByIdent[ident];

			if (siDevice) {
				// Close device safely with error handling
				siDevice.close().catch(err =>
					logger.warn(`Error closing disconnected device`, { deviceId: ident, error: String(err) })
				);
				this.forgetSiDevice(siDevice);
			}
		};
		this.navigatorUsb.addEventListener('disconnect', onDisconnectCallback);
		this.autodetectionCallbacks = {
			onConnect: onConnectCallback,
			onDisconnect: onDisconnectCallback
		};
	}

	stopAutoDetection(): Promise<void> {
		this.deregisterAutodetectionCallbacks();
		return this.closeAutoOpened();
	}

	deregisterAutodetectionCallbacks(): void {
		if (this.autodetectionCallbacks === undefined) {
			return;
		}
		this.navigatorUsb.removeEventListener('connect', this.autodetectionCallbacks.onConnect);
		this.navigatorUsb.removeEventListener('disconnect', this.autodetectionCallbacks.onDisconnect);
		this.autodetectionCallbacks = undefined;
	}

	closeAutoOpened(): Promise<void> {
		return Promise.all(Object.values(this.autodetectedSiDevices).map((autoOpenedDevice) => autoOpenedDevice.close())).then(() => {
			this.autodetectedSiDevices = {};
		});
	}

	async open(device: IWebUsbSiDevice): Promise<void> {
		logger.debug('Opening USB device');
		const navigatorDevice = device.data.device;

		try{
			await navigatorDevice.open()
		}catch(e){
			logger.error('Failed to open USB device', { error: String(e) });
			return Promise.reject(e)
		}
		try {
			logger.debug('Resetting USB device');
			//await navigatorDevice.releaseInterface(0);
			await navigatorDevice.reset();
		} catch (e) {
			logger.error('Failed to reset USB device', { error: String(e) });
			return Promise.reject(new Error("Failed resetting web usb device"))
		}

		try {
			logger.debug('Selecting USB configuration');
			await navigatorDevice.selectConfiguration(siConfiguration);
		} catch (e) {
			logger.error('Failed to select USB configuration', { error: String(e) });
			return Promise.reject(new Error("Failed selecting configuration of web usb device "+e))
		}
		try {
			logger.debug('Claiming USB interface');
			await navigatorDevice.claimInterface(findInterface(navigatorDevice).interfaceNumber);
		} catch (e) {
			logger.error('Failed to claim USB interface', { error: String(e) });
			return Promise.reject(new Error("Failed claiming web usb device interface "+e))
		}
		try {
			logger.debug('Selecting alternate USB interface');
			await navigatorDevice.selectAlternateInterface(findInterface(navigatorDevice).interfaceNumber, siAlternate);
		} catch (e) {
			logger.error('Failed to select alternate USB interface', { error: String(e) });
			return Promise.reject(new Error("Failed selecting alternate interface web usb device "+e))
		}
		try {
			logger.debug('Enabling serial communication');
			await navigatorDevice.controlTransferOut({
				requestType: 'vendor',
				recipient: 'interface',
				request: 0x00,
				value: 0x01,
				index: findInterface(navigatorDevice).interfaceNumber
			});
		} catch (e) {
			logger.error('Failed to enable serial communication', { error: String(e) });
			return Promise.reject(new Error("Failed enabling serial on web usb device "+e))
		}
		try {
			logger.debug('Setting baud rate');
			navigatorDevice.controlTransferOut(
				{
					requestType: 'vendor',
					recipient: 'interface',
					request: 0x1e,
					value: 0x00,
					index: findInterface(navigatorDevice).interfaceNumber
				},
				new Uint8Array([0x00, 0x96, 0x00, 0x00]).buffer
			).then(r =>{
				logger.debug('Baud rate set successfully', { response: r });
			});
			return;
		} catch (e) {
			logger.error('Failed to set baud rate', { error: String(e) });
			return Promise.reject(new Error("Failed setting baudrate on web usb device "+e))
		}

	}

	async close(device: IWebUsbSiDevice): Promise<void> {
		logger.debug('Closing USB device');
		const navigatorDevice = device.data.device;

		// Check if device is already closed
		if (!navigatorDevice.opened) {
			logger.debug('Device already closed');
			this.forgetSiDevice(device);
			return;
		}

		try {
			// Step 1: Disable Serial
			logger.debug('Disabling serial communication');
			await navigatorDevice.controlTransferOut({
				requestType: 'vendor',
				recipient: 'interface',
				request: 0x00,
				value: 0x00,
				index: findInterface(navigatorDevice).interfaceNumber
			});

			// Step 2: Release Interface
			logger.debug('Releasing USB interface');
			await navigatorDevice.releaseInterface(findInterface(navigatorDevice).interfaceNumber);

			// Step 3: Close Device
			logger.debug('Closing USB device connection');
			await navigatorDevice.close();

		} catch (error) {
			// Enhanced error handling with context
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error('Error during USB device close', { error: err.message });
			throw new Error(`Failed to close USB device: ${err.message}`);
		} finally {
			// Always clean up our tracking, even if USB operations failed
			this.forgetSiDevice(device);
		}
	}

	receive(device: IWebUsbSiDevice): Promise<number[]> {
		const navigatorDevice = device.data.device;
		if (navigatorDevice.opened !== true) {
			logger.warn('Device closed, stopping receive loop');
			device.setState(SiDeviceState.Closed);
			throw new DeviceClosedError();
		}
		return navigatorDevice.transferIn(findEndpoint(findInterface(navigatorDevice), 'in').endpointNumber, siPacketSize).then((response) => {
			if (!response.data) {
				return [];
			}
			const uint8Data = new Uint8Array(response.data.buffer);
			return [...uint8Data];
		});
	}

	async send(device: IWebUsbSiDevice, uint8Data: number[]): Promise<void> {
		const navigatorDevice = device.data.device;
		const buffer = new Uint8Array(uint8Data);
		navigatorDevice.transferOut(findEndpoint(findInterface(navigatorDevice), 'out').endpointNumber, buffer).then(() => true);
	}
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-unsafe-declaration-merging
export interface WebUsbSiDeviceDriver extends utils.EventTarget<SiDeviceDriverWithAutodetectionEvents<WebUsbSiDeviceDriverData>> {}
utils.applyMixins(WebUsbSiDeviceDriver, [utils.EventTarget]);

export const getWebUsbSiDeviceDriver = (navigatorWebUsb: USB): WebUsbSiDeviceDriver => new WebUsbSiDeviceDriver(<USB>(<unknown>navigatorWebUsb));
