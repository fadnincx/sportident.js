import * as utils from '../../utils';
import type * as siProtocol from '../../siProtocol';
import { BaseSiCard } from '../BaseSiCard';

export class TCard extends BaseSiCard {
	static typeSpecificInstanceFromMessage(_message: siProtocol.SiMessage): TCard | undefined {
		return undefined;
	}

	getMaxReadSteps(): number {
		return 0; // Not implemented
	}

	typeSpecificRead(): Promise<void> {
		return Promise.reject(new utils.NotImplementedError());
	}
}
BaseSiCard.registerNumberRange(6000000, 7000000, TCard);
