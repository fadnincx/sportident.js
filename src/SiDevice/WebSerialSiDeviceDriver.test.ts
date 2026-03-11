import { describe, expect, test } from '@jest/globals';
import { WebSerialSiDeviceDriver } from './WebSerialSiDeviceDriver';

const SI_VENDOR_ID = 0x10c4;
const SI_PRODUCT_ID = 0x800a;

function makeFakeSerialPort(usbVendorId = SI_VENDOR_ID, usbProductId = SI_PRODUCT_ID): SerialPort {
    return {
        getInfo: () => ({ usbVendorId, usbProductId }),
        open: () => Promise.reject(new Error('SecurityError: Access denied')),
        close: () => Promise.resolve(),
        readable: null,
        writable: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    } as unknown as SerialPort;
}

function makeStubSerial(port?: SerialPort): Serial {
    return {
        requestPort: () => port ? Promise.resolve(port) : Promise.reject(new Error('No port')),
        getPorts: () => Promise.resolve([]),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    } as unknown as Serial;
}

describe('WebSerialSiDeviceDriver', () => {
    describe('detect', () => {
        test('cleans up registry on open() failure, allowing retry', async () => {
            const fakePort = makeFakeSerialPort();
            const driver = new WebSerialSiDeviceDriver(makeStubSerial(fakePort));

            // First call: open() rejects
            await expect(driver.detect()).rejects.toThrow();

            // Second call with same port must not throw 'Duplicate SI device'
            const secondRejection = await driver.detect().catch((e: unknown) => e);
            expect(secondRejection).toBeInstanceOf(Error);
            expect((secondRejection as Error).message).not.toBe('Duplicate SI device');
        });

        test('rejects for non-SI device', async () => {
            const nonSiPort = makeFakeSerialPort(0x1234, 0x800a);
            const driver = new WebSerialSiDeviceDriver(makeStubSerial(nonSiPort));

            await expect(driver.detect()).rejects.toThrow('Not a SI device');
        });
    });
});
