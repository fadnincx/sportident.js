import type * as siProtocol from '../../siProtocol';
import { ModernSiCard } from './ModernSiCard';
import { BaseSiCard } from '../BaseSiCard';

export class SIAC extends ModernSiCard {
	static typeSpecificInstanceFromMessage(message: siProtocol.SiMessage): SIAC | undefined {
		const info = this.parseModernSiCardDetectionMessage(message);
		if (info === undefined) {
			return undefined;
		}
		if (info.cardSeries !== 'SIAC') {
			return undefined;
		}
		return new this(info.cardNumber);
	}
}
BaseSiCard.registerNumberRange(8000000, 9000000, SIAC);
