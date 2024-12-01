import type * as utils from '../utils';

export interface WebSerialConnectEvent extends utils.IEvent<'connect'> {
	device: WebSerialDevice;
	target: unknown;
	defaultPrevented: boolean;
}

export interface WebSerialDisconnectEvent extends utils.IEvent<'disconnect'> {
	device: WebSerialDevice;
	target: unknown;
	defaultPrevented: boolean;
}

export type WebSerialEvents = {
	connect: WebSerialConnectEvent;
	disconnect: WebSerialDisconnectEvent;
};

interface SerialPortRequestOptions {
	filters: SerialPortFilter[];
}
export interface Serial extends EventTarget {
	onconnect: EventHandler | undefined;
	ondisconnect: EventHandler | undefined;
	getPorts(): Promise<WebSerialDevice[]>;
	requestPort(options?: SerialPortRequestOptions): Promise<WebSerialDevice>; // Chromium implementation (spec: SerialOptions)
}

interface Navigator {
	readonly serial: Serial;
}

interface RequestDeviceArgs {
	filters: WebSerialDeviceFilter[];
}

interface WebSerialDeviceFilter {
	usbVendorId?: number;
	usbProductId?: number;
}

export interface WebSerialDevice {
	connected: boolean;
	onconnect: EventHandler;
	ondisconnect: EventHandler;
	readonly readable: ReadableStream; // Chromium implementation (spec: in)
	readonly writable: WritableStream; // Chromium implementation (spec: out)
	open(options: SerialOptions): Promise<void>;
	close(): Promise<void>;
	getInfo(): Partial<SerialPortInfo>;
	forget(): Promise<void>;
}
type EventHandler = (event: Event) => void;
type ParityType = 'none' | 'even' | 'odd' | 'mark' | 'space';
type FlowControlType = 'none' | 'hardware';
interface SerialOptions {
	baudRate: number;
	dataBits?: number | undefined;
	stopBits?: number | undefined;
	parity?: ParityType | undefined;
	bufferSize?: number | undefined;
	flowControl?: FlowControlType | undefined;
}
interface SerialPortInfo extends SerialPortInfoBase, SerialPortFilter {} // mix spec and Chromium implementation
interface SerialPortInfoBase {
	serialNumber: string;
	manufacturer: string;
	locationId: string;
	vendorId: string;
	vendor: string;
	productId: string;
	product: string;
}

interface SerialPortFilter {
	usbVendorId: number;
	usbProductId?: number | undefined;
}
