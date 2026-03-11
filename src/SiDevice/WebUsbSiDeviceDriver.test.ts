import { describe, expect, test } from '@jest/globals';
import { WebUsbSiDeviceDriver } from './WebUsbSiDeviceDriver';

const SI_VENDOR_ID = 0x10c4;
const SI_PRODUCT_ID = 0x800a;

function makeFakeUsbDevice(serialNumber = 'test-serial'): USBDevice {
    return {
        vendorId: SI_VENDOR_ID,
        productId: SI_PRODUCT_ID,
        serialNumber,
        open: () => Promise.reject(new Error('SecurityError: Access denied')),
        close: () => Promise.resolve(),
        selectConfiguration: () => Promise.resolve(),
        claimInterface: () => Promise.resolve(),
        releaseInterface: () => Promise.resolve(),
        controlTransferIn: () => Promise.resolve({} as USBInTransferResult),
        controlTransferOut: () => Promise.resolve({} as USBOutTransferResult),
        transferIn: () => Promise.resolve({} as USBInTransferResult),
        transferOut: () => Promise.resolve({} as USBOutTransferResult),
        configuration: null,
        configurations: [],
        deviceClass: 0,
        deviceProtocol: 0,
        deviceSubclass: 0,
        deviceVersionMajor: 0,
        deviceVersionMinor: 0,
        deviceVersionSubminor: 0,
        manufacturerName: undefined,
        opened: false,
        productName: undefined,
        usbVersionMajor: 0,
        usbVersionMinor: 0,
        usbVersionSubminor: 0,
        isochronousTransferIn: () => Promise.resolve({} as USBIsochronousInTransferResult),
        isochronousTransferOut: () => Promise.resolve({} as USBIsochronousOutTransferResult),
        reset: () => Promise.resolve(),
        forget: () => Promise.resolve(),
    } as unknown as USBDevice;
}

function makeStubUsb(): USB {
    return {
        requestDevice: () => Promise.reject(new Error('No device')),
        getDevices: () => Promise.resolve([]),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    } as unknown as USB;
}

describe('WebUsbSiDeviceDriver', () => {
    describe('autodetectSiDevice', () => {
        test('cleans up registry on open() failure, allowing retry', async () => {
            const driver = new WebUsbSiDeviceDriver(makeStubUsb());
            const fakeDevice = makeFakeUsbDevice();

            // First call: open() rejects
            await expect(driver.autodetectSiDevice(fakeDevice)).rejects.toThrow();

            // Second call with same device must not throw 'Duplicate SI device'
            // (it will still reject because open() fails, but NOT with a duplicate error)
            const secondRejection = await driver.autodetectSiDevice(fakeDevice).catch((e: unknown) => e);
            expect(secondRejection).toBeInstanceOf(Error);
            expect((secondRejection as Error).message).not.toBe('Duplicate SI device');
        });

        test('rejects immediately for non-SI device', async () => {
            const driver = new WebUsbSiDeviceDriver(makeStubUsb());
            const nonSiDevice = { ...makeFakeUsbDevice(), vendorId: 0x1234 } as unknown as USBDevice;

            await expect(driver.autodetectSiDevice(nonSiDevice)).rejects.toThrow('Not a SI device');
        });
    });
});
