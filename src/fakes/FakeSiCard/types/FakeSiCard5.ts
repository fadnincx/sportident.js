import { proto } from '../../../constants';
import * as siProtocol from '../../../siProtocol';
import type * as storage from '../../../storage';
import { BaseFakeSiCard } from '../BaseFakeSiCard';
import { type ISiCard5StorageFields, SiCard5, siCard5StorageDefinition } from '../../../SiCard/types/SiCard5';
import { getSiCard5Examples } from '../../../SiCard/types/siCard5Examples';

export class FakeSiCard5 extends BaseFakeSiCard {
	static siCardClass = SiCard5;
	static getAllExamples = getSiCard5Examples;

	public storage: storage.ISiStorage<ISiCard5StorageFields>;

	constructor(storageData: (number | undefined)[] | undefined) {
		super();
		this.storage = siCard5StorageDefinition(storageData);
	}

	handleDetect(): siProtocol.SiMessage {
		const cardNumberArr = siProtocol.cardNumber2arr(this.storage.get('cardNumber')!.value);
		cardNumberArr.reverse();
		return {
			command: proto.cmd.SI5_DET,
			parameters: [...cardNumberArr] as number[]
		};
	}

	handleRequest(message: siProtocol.SiMessage): siProtocol.SiMessage[] {
		if (message.mode !== undefined || message.command !== proto.cmd.GET_SI5 || message.parameters.length !== 0) {
			throw new Error(`SiCard5 can not handle ${siProtocol.prettyMessage(message)}`);
		}
		return [
			{
				command: proto.cmd.GET_SI5,
				parameters: this.storage.data.toJS()
			}
		] as siProtocol.SiMessage[];
	}
}
