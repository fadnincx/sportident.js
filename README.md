# sportident.js
[![GitHub License](https://img.shields.io/github/license/fadnincx/sportident.js)](https://github.com/fadnincx/sportident.js/blob/main/LICENSE)
[![NPM Version](https://img.shields.io/npm/v/sportident.js)](https://www.npmjs.com/package/sportident.js)

JavaScript/TypeScript interface to SportIdent devices

## Usage example, read si card numer with serial driver

`npm i sportident.js`

Then in your code

```
import { getWebSerialSiDeviceDriver } from 'sportident.js/SiDevice/WebSerialSiDeviceDriver';
import { SiMainStation } from 'sportident.js/SiStation';

if(window.navigator.serial){
  getWebSerialSiDeviceDriver(window.navigator.serial).detect()
    .catch(e =>{
        console.error("Failed to connect to si station",e)
    }).then(sidevice => {
        SiMainStation.fromSiDevice(sidevice).readCards(
            (card) => {
                alert(card.cardNumber)
                card.confirm()
            }
        )
    })
}
```

## Reader BT (Bluetooth Low Energy)

The SPORTident **Reader BT** is a BLE-only reader. It does not speak the classic SI serial
protocol at all — no WAKEUP/STX/CRC framing, no page-by-page card memory — so it has its own
stack under `sportident.js/SiReaderBt`. The two converge at the card result: a Reader BT
readout produces the same `IRaceResultData` (`toDict()`, `getNormalizedRaceResult()`, …) as a
card read over serial.

```ts
import { getWebBluetoothSiReaderBtDriver } from 'sportident.js/SiReaderBt/WebBluetoothSiReaderBtDriver';
import { ReaderBtStation } from 'sportident.js/SiReaderBt';

// detect() MUST be called from a user gesture, e.g. a click handler.
button.addEventListener('click', async () => {
    const device = await getWebBluetoothSiReaderBtDriver(navigator.bluetooth).detect();
    const station = await ReaderBtStation.fromSiReaderBtDevice(device).open();

    await station.readCards(async (card) => {
        await card.read();       // one BLE round trip
        console.log(card.toDict());
        await card.confirm();    // short feedback beep on the reader
    });
});
```

Before the reader will appear in the chooser, insert its **Service/OFF** instruction card: it
then advertises for about 20 seconds. If the chooser comes up empty you get a
`ReaderBtNotFoundError` saying exactly that.

### Showing read progress

`siCardInserted` fires the moment a card goes in, before any readout, so you can show a
spinner immediately. During `card.read()` the card emits `readStart`, `readProgress` and
`readComplete`:

```ts
card.addEventListener('readProgress', (event) => {
    progressBar.value = event.percentage;
});
```

For a readout the reader splits across several BLE notifications, `percentage` is measured
from the bytes actually received. For a small readout that fits one notification there is no
intermediate progress to measure, so it falls back to an interpolated estimate. Either way the
value is monotonic.

### Several readers at once

Each connected reader has its own request queue, so a session download on one never delays a
card readout on another. `ReaderBtStationRegistry` holds them and gives them one event stream:

```ts
import { getReaderBtStationRegistry } from 'sportident.js/SiReaderBt';

const registry = getReaderBtStationRegistry();
registry.add(station);

// 'all' (the default) aggregates every reader; events carry their source station.
registry.addEventListener('siCardInserted', (event) => {
    console.log(`card ${event.siCard.cardNumber} on ${event.station.ident}`);
});

// Or let the user pick one. Idents are stable, so they can be persisted.
registry.dispatchMode = 'activeOnly';
registry.setActive(localStorage.getItem('myReaderIdent') ?? registry.stations[0].ident);
```

### Browser support, and native apps

Web Bluetooth works in Chrome and Edge (desktop and Android), in a secure context only — not
Safari, not Firefox. Check with `isWebBluetoothAvailable()`.

The BLE backend is pluggable, so a native app can supply its own driver and get OS-level
scanning, bonded devices and reconnect. Implement `ISiReaderBtDriver` — the same shape as
`ISiDeviceDriver`, so a serial driver author will recognise it — plus optionally
`ISiReaderBtDriverWithDetection` and `ISiReaderBtDriverWithAutodetection`. The Web Bluetooth
driver deliberately does **not** implement autodetection, because `getDevices()` and
`watchAdvertisements()` are behind Chrome flags; a native driver can. `FakeSiReaderBtDriver`
in `sportident.js/fakes` implements all three and is the reference to copy.

### Supported cards

Reader BT reads SIAC, SI-Card 8/9/10/11, pCard and ComCard. SI-Card 5 and 6 are not supported
by the hardware.

> **Note:** the Reader BT support is written against the published protocol specification and
> has not yet been verified against physical hardware. The wire-format fixtures are marked
> `SPEC-DERIVED` in `src/SiReaderBt/readerBtExamples.ts`.
