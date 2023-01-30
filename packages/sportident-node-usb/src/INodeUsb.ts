export interface NodeUsbDevice {
    deviceDescriptor: NodeUsbDeviceDescriptor
    opened: boolean;
    open: () => void;
    close: () => void;
    setConfiguration: (configuration: number, callback: (error?: Error) => void) => void;
    interface: (interfaceNumber: number) => NodeUsbDeviceInterface;
    controlTransfer: (
        bmRequestType: number,
        bRequest: number,
        wValue: number,
        wIndex: number,
        dataOrLength: any,
        callback: (error?: Error, data?: any) => void,
    ) => void;
}

interface NodeUsbDeviceDescriptor {
    idVendor: number;
    idProduct: number;
    iSerialNumber: string;
}

export interface NodeUsbDeviceInterface {
    claim: () => Promise<void>;
    setAltSetting: (alternate: number, callback: (error?: Error) => void) => void;
    endpoint: (address: number) => NodeUsbDeviceEndpoint;
    release: (closeEndpoints: boolean, callback: (error?: Error) => void) => void;
}

interface NodeUsbDeviceEndpoint {
    transfer: (lengthOrData: number|any, callback: (error?: any, data?: any) => void) => void;
}

export const promisify = <T>(fn: (check: (error?: Error, data?: T) => void) => void): Promise<T> => new Promise((resolve, reject) => {
    const check = (error?: Error, data?: T) => {
        if (error) {
            reject(error);
        } else if (data === undefined) {
            reject(new Error('no data'));
        } else {
            resolve(data);
        }
    };
    fn(check);
});
