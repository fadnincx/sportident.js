import * as utils from '../utils';
import {BaseSiDevice} from './BaseSiDevice';
import {SiMainStation} from '../SiMainStation';

const siConfiguration = 1;
const siInterface = 0;
const siAlternate = 0;
const siEndpoint = 1;
const siPacketSize = 64;
const siDeviceFilters = [
    {vendorId: 0x10c4, productId: 0x800a},
];
const matchesSiDeviceFilters = (vendorId, productId) => siDeviceFilters
    .some((filter) => vendorId === filter.vendorId && productId === filter.productId);

export const getWebUsbSiDevice = (navigatorArg) => {
    if (!('usb' in navigatorArg)) {
        return null;
    }
    class WebUsbSiDevice extends BaseSiDevice {
        static detect() {
            return new Promise((resolve, reject) => {
                navigatorArg.usb.requestDevice({
                    filters: siDeviceFilters,
                })
                    .then((selectedDevice) => {
                        const device = this.getOrCreate(selectedDevice);
                        return device.open();
                    })
                    .then((openedDevice) => {
                        resolve(openedDevice);
                    })
                    .catch((error) => reject(error));
            });
        }

        static startAutoDetection() {
            if (this._autodetectionCallbacks !== undefined) {
                console.warn('WebUsbSiDevice.startAutoDetection called, but autodetection is already started.');
                this.stopAutoDetection();
            }
            return new Promise((resolve, reject) => {
                this.registerAutodetectionCallbacks();
                navigatorArg.usb.getDevices()
                    .then((webUsbDevices) => {
                        const initialDevices = webUsbDevices
                            .filter((webUsbDevice) => matchesSiDeviceFilters(webUsbDevice.vendorId, webUsbDevice.productId))
                            .map((webUsbDevice) => this.getOrCreate(webUsbDevice));
                        Promise.all(initialDevices.map((initialDevice) => initialDevice.open()))
                            .then(() => {
                                resolve(initialDevices);
                            });
                    })
                    .catch((error) => reject(error));
            });
        }

        static registerAutodetectionCallbacks() {
            const onConnectCallback = (event) => {
                if (!matchesSiDeviceFilters(event.device.vendorId, event.device.productId)) {
                    return;
                }
                const newDevice = this.getOrCreate(event.device);
                newDevice.open()
                    .then(() => {
                        this.dispatchEvent('add', newDevice);
                    });
            };
            navigatorArg.usb.addEventListener('connect', onConnectCallback);
            const onDisconnectCallback = (event) => {
                if (!matchesSiDeviceFilters(event.device.vendorId, event.device.productId)) {
                    return;
                }
                const removedDevice = this.getOrCreate(event.device);
                this.remove(removedDevice);
                this.dispatchEvent('remove', removedDevice);
            };
            navigatorArg.usb.addEventListener('disconnect', onDisconnectCallback);
            this._autodetectionCallbacks = {
                onConnectCallback: onConnectCallback,
                onDisconnectCallback: onDisconnectCallback,
            };
        }

        static stopAutoDetection() {
            if (this._autodetectionCallbacks === undefined) {
                console.warn('WebUsbSiDevice.stopAutoDetection called, but WebUsbSiDevice.startAutoDetection had not been called before.');
            }
            this.deregisterAutodetectionCallbacks();
        }

        static deregisterAutodetectionCallbacks() {
            navigatorArg.usb.removeEventListener('connect', this._autodetectionCallbacks.onConnectCallback);
            navigatorArg.usb.removeEventListener('disconnect', this._autodetectionCallbacks.onDisconnectCallback);
            this._autodetectionCallbacks = undefined;
        }

        static getOrCreate(webUsbDevice) {
            if (webUsbDevice.serialNumber in this.allByIdent) {
                return this.allByIdent[webUsbDevice.serialNumber];
            }
            const newDevice = new this(webUsbDevice);
            this.allByIdent[webUsbDevice.serialNumber] = newDevice;
            return newDevice;
        }

        static remove(device) {
            delete this.allByIdent[device.webUsbDevice.serialNumber];
        }

        constructor(webUsbDevice) {
            super();
            this.webUsbDevice = webUsbDevice;
            this.name = `WebUsbSiDevice(${webUsbDevice.serialNumber})`;
            this._mainStation = null;
        }

        open() {
            if (this.state === this.constructor.State.Closing) {
                throw new Error('Cannot open closing WebUsbSiDevice');
            }
            if (this.state === this.constructor.State.Opening) {
                throw new Error('Cannot open opening WebUsbSiDevice');
            }
            if (this.state === this.constructor.State.Opened) {
                return Promise.resolve(this);
            }
            return new Promise((resolve, reject) => {
                console.debug('Opening...');
                this.setSiDeviceState(this.constructor.State.Opening);
                return this.webUsbDevice.open()
                    .then(() => {
                        console.debug('Resetting...');
                        return this.webUsbDevice.reset();
                    })
                    .then(() => {
                        console.debug('Selecting Configuration...');
                        return this.webUsbDevice.selectConfiguration(siConfiguration);
                    })
                    .then(() => {
                        console.debug('Claiming Interface...');
                        return this.webUsbDevice.claimInterface(siInterface);
                    })
                    .then(() => {
                        console.debug('Selection Alternate Interface...');
                        return this.webUsbDevice.selectAlternateInterface(siInterface, siAlternate);
                    })
                    .then(() => {
                        console.debug('Enabling Serial...');
                        return this.webUsbDevice.controlTransferOut({
                            requestType: 'vendor',
                            recipient: 'interface',
                            request: 0x00,
                            value: 0x01,
                            index: siInterface,
                        });
                    })
                    .then(() => {
                        console.debug('Setting Baudrate...');
                        return this.webUsbDevice.controlTransferOut({
                            requestType: 'vendor',
                            recipient: 'interface',
                            request: 0x1E,
                            value: 0x00,
                            index: siInterface,
                        }, new Uint8Array([0x00, 0x96, 0x00, 0x00]).buffer);
                    })
                    .then(() => {
                        console.debug('Starting Receive Loop...');
                        const receiveLoop = () => {
                            if (this.webUsbDevice.opened !== true) {
                                console.warn('Device has been closed. Stopping receive loop.');
                                return;
                            }
                            this.receive()
                                .catch((err) => {
                                    console.warn(err);
                                })
                                .then(() => receiveLoop());
                        };
                        receiveLoop();
                        this.setSiDeviceState(this.constructor.State.Opened);
                        resolve(this);
                    })
                    .catch((err) => reject(err));
            });
        }

        close() {
            if (this.state === this.constructor.State.Closing) {
                throw new Error('Cannot close closing WebUsbSiDevice');
            }
            if (this.state === this.constructor.State.Opening) {
                throw new Error('Cannot close opening WebUsbSiDevice');
            }
            if (this.state === this.constructor.State.Closed) {
                return Promise.resolve(this);
            }
            return new Promise((resolve, reject) => {
                console.debug('Disabling Serial...');
                this.setSiDeviceState(this.constructor.State.Closing);
                this.webUsbDevice.controlTransferOut({
                    requestType: 'vendor',
                    recipient: 'interface',
                    request: 0x00,
                    value: 0x00,
                    index: siInterface,
                })
                    .then(() => {
                        console.debug('Releasing Interface...');
                        return this.webUsbDevice.releaseInterface(siInterface);
                    })
                    .then(() => {
                        console.debug('Closing Device...');
                        return this.webUsbDevice.close();
                    })
                    .then(() => {
                        this.setSiDeviceState(this.constructor.State.Closed);
                        resolve(this);
                    })
                    .catch((err) => reject(err));
            });
        }

        receive() {
            return this.webUsbDevice.transferIn(siEndpoint, siPacketSize)
                .then((response) => {
                    var bufView = new Uint8Array(response.data.buffer);
                    console.debug(`<= (WebUsb)\n${utils.prettyHex(bufView, 16)}`);
                    this.dispatchEvent('receive', bufView);

                    // TODO: remove from here
                    if (this._mainStation !== null) {
                        for (var i = 0; i < bufView.length; i++) {
                            this._mainStation._respBuffer.push(bufView[i]);
                        }
                        this._mainStation._processReceiveBuffer();
                    }

                    return response;
                });
        }

        send(buffer) {
            return this.webUsbDevice.transferOut(siEndpoint, buffer);
        }

        get mainStation() {
            if (this.state !== this.constructor.State.Opened) {
                this._mainStation = null;
                throw new Error('Cannot get mainStation unless in Opened state');
            }
            if (this._mainStation === null) {
                console.debug('Creating SiMainStation...');
                this._mainStation = new SiMainStation(this);
            }
            return this._mainStation;
        }
    }
    WebUsbSiDevice.allByIdent = {};
    WebUsbSiDevice._eventListeners = {};
    return WebUsbSiDevice;
};
