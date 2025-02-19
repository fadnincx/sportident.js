import * as utils from '../utils';
import { DeviceClosedError, type ISiDevice, type ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import type { ISiDeviceDriver, ISiDeviceDriverWithAutodetection, ISiDeviceDriverWithDetection, SiDeviceDriverWithAutodetectionEvents } from '../SiDevice/ISiDeviceDriver';
import { SiDeviceAddEvent, SiDeviceRemoveEvent } from '../SiDevice/ISiDeviceDriver';
import { SiDevice } from '../SiDevice/SiDevice';
//import type * as nav from './INavigatorWebSerial';

const siDeviceFilters = [{ usbVendorId: 0x10c4, usbProductId: 0x800a }];
const matchesSiDeviceFilters = (usbVendorId: number, usbProductId: number) => siDeviceFilters.some((filter) => usbVendorId === filter.usbVendorId && usbProductId === filter.usbProductId);

const getIdent = (device: SerialPort) => `${device.getInfo().usbProductId}`;

export interface WebSerialSiDeviceDriverData extends ISiDeviceDriverData<WebSerialSiDeviceDriver> {
	driver: WebSerialSiDeviceDriver;
	device: SerialPort;
}

export type IWebSerialSiDevice = ISiDevice<WebSerialSiDeviceDriverData>;
export type WebSerialSiDevice = SiDevice<WebSerialSiDeviceDriverData>;

export class WebSerialSiDeviceDriver implements ISiDeviceDriver<WebSerialSiDeviceDriverData>, ISiDeviceDriverWithDetection<WebSerialSiDeviceDriverData, []>, ISiDeviceDriverWithAutodetection<WebSerialSiDeviceDriverData> {
	public name = 'WebSerial';

	private siDeviceByIdent: { [ident: string]: WebSerialSiDevice } = {};

	private autodetectedSiDevices: { [ident: string]: WebSerialSiDevice } = {};

	private reader: ReadableStreamDefaultReader<any> | undefined;

	constructor(private navigatorSerial: Serial) {}
	startAutoDetection(): Promise<ISiDevice<WebSerialSiDeviceDriverData>[]>{
		console.debug("Start serial autodetection")
		this.navigatorSerial.addEventListener("connect",(event:Event)=>{
			console.log(event.target,"connected")
			const i = getIdent((event.target as SerialPort))
			if(this.autodetectedSiDevices[i] == undefined){
				const siDevice = this.getSiDevice((event.target as SerialPort));
				this.autodetectedSiDevices[i] = siDevice;
				siDevice.open();
			}
			this.dispatchEvent('add', new SiDeviceAddEvent(this.autodetectedSiDevices[i]))
		})
		this.navigatorSerial.addEventListener("disconnect",(event:Event)=>{
			console.log(event.target,"disconnected")
			const i = getIdent((event.target as SerialPort))
			if(this.autodetectedSiDevices[i] != undefined){
				this.dispatchEvent('remove', new SiDeviceRemoveEvent(this.autodetectedSiDevices[i]))
				this.forgetSiDevice(this.autodetectedSiDevices[i])
			}
		})

		return this.getExistingDevices()
	}
	stopAutoDetection(): Promise<unknown> {
		return Promise.resolve()
	}

	async detect(): Promise<WebSerialSiDevice> {
		return this.navigatorSerial
			.requestPort({
				filters: siDeviceFilters
			})
			.catch((e) => {
				return Promise.reject(new Error('Failed to get access to Serial device!' + e.toString()));
			})
			.then((navigatorWebSerialDevice: SerialPort) => {
				if (!matchesSiDeviceFilters(navigatorWebSerialDevice.getInfo().usbVendorId || 0, navigatorWebSerialDevice.getInfo().usbProductId || 0)) {
					return Promise.reject(new Error('Not a SI device'));
				}
				const ident = getIdent(navigatorWebSerialDevice);
				if (this.autodetectedSiDevices[ident] !== undefined) {
					return Promise.reject(new Error('Duplicate SI device'));
				}
				const siDevice = this.getSiDevice(navigatorWebSerialDevice);
				this.autodetectedSiDevices[ident] = siDevice;
				navigatorWebSerialDevice.addEventListener("disconnect",()=>{
					console.log("serial disconnect event, closing si device!")
					siDevice.close()
				})
				this.navigatorSerial.addEventListener("disconnect",(event:Event)=>{
					console.log(event.target,"disconnected")
					if((event.target as SerialPort) == navigatorWebSerialDevice){
						console.log("matches device, close sidevice")
						siDevice.close()
					}
				})
				return siDevice.open();
			});
	}

	async getExistingDevices(): Promise<WebSerialSiDevice[]> {
		return this.navigatorSerial.getPorts().then((ports)=>{
			const r:WebSerialSiDevice[] = []
			for(const port of ports){
				const i = getIdent(port)
				if(this.autodetectedSiDevices[i] !== undefined){
					r.push(this.autodetectedSiDevices[i])
				}else{
					const siDevice = this.getSiDevice(port);
					this.autodetectedSiDevices[i] = siDevice;
					port.addEventListener("disconnect",()=>{
						console.log("serial disconnect event, closing si device!")
						siDevice.close()
					})
					this.navigatorSerial.addEventListener("disconnect",(event:Event)=>{
						console.log(event.target,"disconnected")
						if((event.target as SerialPort) == port){
							console.log("matches device, close sidevice")
							siDevice.close()
						}
					})
					siDevice.open();
					r.push(siDevice)
				}
			}
			return r
		})
	}

	getSiDevice(navigatorWebSerialDevice: SerialPort): WebSerialSiDevice {
		const ident = getIdent(navigatorWebSerialDevice);
		if (this.siDeviceByIdent[ident] !== undefined) {
			return this.siDeviceByIdent[ident];
		}
		const newSiDeviceData: WebSerialSiDeviceDriverData = {
			driver: this,
			device: navigatorWebSerialDevice
		};
		const newSiDevice = new SiDevice(ident, newSiDeviceData);
		this.siDeviceByIdent[ident] = newSiDevice;
		return newSiDevice;
	}

	forgetSiDevice(siDevice: IWebSerialSiDevice) {
		const navigatorWebSerialDevice = siDevice.data.device;
		const ident = getIdent(navigatorWebSerialDevice);
		delete this.siDeviceByIdent[ident];
		if (this.autodetectedSiDevices[ident] !== undefined) {
			this.dispatchEvent('remove', new SiDeviceRemoveEvent(siDevice));
		}
		delete this.autodetectedSiDevices[ident];
	}

	open(device: IWebSerialSiDevice): Promise<void> {
		console.debug('Opening...');
		const navigatorDevice = device.data.device;
		return navigatorDevice.open({ baudRate: 38400 })
		.catch((e) => {
			return Promise.reject(new Error("Failed to open serial device"))
		});
	}

	async close(device: IWebSerialSiDevice): Promise<void> {
		console.debug('Disabling Serial...');
		const navigatorDevice = device.data.device;
		try {
			if (this.reader != undefined) {
				this.reader.releaseLock();
			}
		} catch (e) {
			console.warn(e);
		}
		this.forgetSiDevice(device);
		if(navigatorDevice.readable != null){
			await navigatorDevice.readable.cancel();
		}
		await navigatorDevice.close();
	}

	async receive(device: IWebSerialSiDevice): Promise<number[]> {
		const navigatorDevice = device.data.device;
		try {
			let readable =  navigatorDevice.readable
			if (readable != null){
				this.reader = readable.getReader();
				while (true) {
					const { value, done } = await this.reader.read();
					if (done) {
						if (value == undefined) {
							return [];
						}
						return value;
					}
					if (value != undefined) {
						return value;
					}
				}
			}else{
				this.close(device)
				throw new DeviceClosedError("Device closing!")
			}
		} catch (error) {
			throw error
		} finally {
			if(this.reader != undefined){
				this.reader.releaseLock();
			}
		}
	}

	async send(device: IWebSerialSiDevice, uint8Data: number[]): Promise<void> {
		const navigatorDevice = device.data.device;
		const buffer = new Uint8Array(uint8Data);
		if (navigatorDevice.writable == null) {
			console.error('SiStation is not writable!');
			return;
		}
		const writer = navigatorDevice.writable.getWriter();
		await writer
			.write(buffer)
			.then(() => {
				return writer.releaseLock();
			})
			.then(() => true);
	}
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WebSerialSiDeviceDriver extends utils.EventTarget<SiDeviceDriverWithAutodetectionEvents<WebSerialSiDeviceDriverData>> {}
utils.applyMixins(WebSerialSiDeviceDriver, [utils.EventTarget]);

export const getWebSerialSiDeviceDriver = (navigatorWebSerial: Serial): WebSerialSiDeviceDriver => new WebSerialSiDeviceDriver(<Serial>(<unknown>navigatorWebSerial));
