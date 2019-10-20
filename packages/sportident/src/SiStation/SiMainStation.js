import * as utils from '../utils';
import * as siProtocol from '../siProtocol';
import {proto} from '../constants';
import {BaseSiCard} from '../SiCard';
import {SiTargetMultiplexer} from './SiTargetMultiplexer';
import {BaseSiStation} from './BaseSiStation';

export class SiMainStation extends BaseSiStation {
    static get multiplexerTarget() {
        return SiTargetMultiplexer.Target.Direct;
    }

    constructor(siTargetMultiplexer) {
        super(siTargetMultiplexer);
        this.siCard = false;
        this._eventListeners = {};
        siTargetMultiplexer.addEventListener('message', (e) => {
            const message = e.message;
            this.handleMessage(message);
            console.log(`There's a SiMainStation listening to this ${message}`);
        });
    }

    addEventListener(type, callback) {
        return utils.addEventListener(this._eventListeners, type, callback);
    }

    removeEventListener(type, callback) {
        return utils.removeEventListener(this._eventListeners, type, callback);
    }

    dispatchEvent(type, args) {
        return utils.dispatchEvent(this._eventListeners, type, args);
    }

    handleMessage(message) {
        const {command, parameters} = message;
        const detectedSiCard = BaseSiCard.detectFromMessage(message);
        if (detectedSiCard !== undefined) {
            detectedSiCard.mainStation = this;
            this.siCard = detectedSiCard;
            this.dispatchEvent('siCardInserted', {siCard: this.siCard, siMainStation: this});
            return;
        }
        const handleSiCardRemoved = () => {
            const removedCardNumber = siProtocol.arr2cardNumber([parameters[5], parameters[4], parameters[3]]); // TODO: also [2]?
            if (this.siCard !== false && this.siCard.cardNumber === removedCardNumber) {
                this.dispatchEvent('siCardRemoved', {siCard: this.siCard, siMainStation: this});
            } else {
                console.warn(`Card ${removedCardNumber} was removed, but never inserted`);
            }
            this.siCard = false;
        };
        const handleSiCardObserved = () => {
            const observedCardNumber = siProtocol.arr2cardNumber([parameters[5], parameters[4], parameters[3]]); // TODO: also [2]?
            const transRecordCard = BaseSiCard.fromCardNumber(observedCardNumber);
            transRecordCard.mainStation = this;
            this.dispatchEvent('siCardObserved', {siCard: transRecordCard, siMainStation: this});
        };
        const handlerByCommand = {
            [proto.cmd.SI_REM]: handleSiCardRemoved,
            [proto.cmd.TRANS_REC]: handleSiCardObserved,
        };
        const handler = handlerByCommand[command];
        if (handler === undefined) {
            return;
        }
        handler();
    }

    sendMessage(message, numResponses, timeoutInMiliseconds) {
        return this.siTargetMultiplexer.sendMessage(
            SiTargetMultiplexer.Target.Direct,
            message,
            numResponses,
            timeoutInMiliseconds,
        );
    }
}