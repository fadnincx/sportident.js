# sportident.js
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
