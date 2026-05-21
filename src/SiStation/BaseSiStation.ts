import { proto } from '../constants';
import * as storage from '../storage';
import * as siProtocol from '../siProtocol';
import * as utils from '../utils';
import { type ISiStation, SiStationMode, SiStationModel } from './ISiStation';
import { type ISiTargetMultiplexer, SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';

const logger = utils.getLogger('BaseSiStation');
export interface ISiStationStorageFields {
	code: number;
	mode: keyof typeof SiStationMode;
	beeps: boolean;
	flashes: boolean;
	autoSend: boolean;
	extendedProtocol: boolean;
	serialNumber: number;
	firmwareVersion: number;
	buildDate: Date;
	deviceModel: keyof typeof SiStationModel;
	memorySize: number;
	batteryDate: Date;
	batteryCapacity: number;
	batteryState: number;
	backupPointer: number;
	siCard6Mode: number;
	memoryOverflow: number;
	lastWriteDate: Date;
	autoOffTimeout: number;
	refreshRate: number;
	powerMode: number;
	interval: number;
	wtf: number;
	program: number;
	handshake: boolean;
	sprint4ms: boolean;
	passwordOnly: boolean;
	stopOnFullBackup: boolean;
	autoReadout: boolean;
	sleepDay: number;
	sleepSeconds: number;
	workingMinutes: number;
}
export const siStationStorageLocations: storage.ISiStorageLocations<ISiStationStorageFields> = {
	code: new storage.SiInt([[0x72], [0x73, 6, 8]]),
	mode: new storage.SiEnum([[0x71]], SiStationMode),
	beeps: new storage.SiBool(0x73, 2),
	flashes: new storage.SiBool(0x73, 0),
	autoSend: new storage.SiBool(0x74, 1),
	extendedProtocol: new storage.SiBool(0x74, 0),
	serialNumber: new storage.SiInt([[0x03], [0x02], [0x01], [0x00]]),
	firmwareVersion: new storage.SiInt([[0x07], [0x06], [0x05]]),
	buildDate: new siProtocol.SiDate(3, (i) => 0x08 + i),
	deviceModel: new storage.SiEnum([[0x0c], [0x0b]], SiStationModel),
	memorySize: new storage.SiInt([[0x0d]]),
	batteryDate: new siProtocol.SiDate(3, (i) => 0x15 + i),
	batteryCapacity: new storage.SiInt([[0x1a], [0x19]]),
	batteryState: new storage.SiInt([[0x37], [0x36], [0x35], [0x34]]),
	// 2000mAh: 000000=0%, 6E0000=100%, 1000mAh:000000=0%, 370000=100%
	backupPointer: new storage.SiInt([[0x22], [0x21], [0x1d], [0x1c]]),
	siCard6Mode: new storage.SiInt([[0x33]]),
	// 08 or FF = 192 punches, 00 or C1 normal
	memoryOverflow: new storage.SiInt([[0x3d]]),
	// overflow if != 00
	lastWriteDate: new siProtocol.SiDate(6, (i) => 0x75 + i),
	autoOffTimeout: new storage.SiInt([[0x7f], [0x7e]]),
	refreshRate: new storage.SiInt([[0x10]]),
	// in 3/sec ???
	powerMode: new storage.SiInt([[0x11]]),
	// 06 low power, 08 standard/sprint
	interval: new storage.SiInt([[0x49], [0x48]]),
	// in 32*ms
	wtf: new storage.SiInt([[0x4b], [0x4a]]),
	// in 32*ms
	program: new storage.SiInt([[0x70]]),
	// xx0xxxxxb competition, xx1xxxxxb training
	handshake: new storage.SiBool(0x74, 2),
	sprint4ms: new storage.SiBool(0x74, 3),
	passwordOnly: new storage.SiBool(0x74, 4),
	stopOnFullBackup: new storage.SiBool(0x74, 5),
	autoReadout: new storage.SiBool(0x74, 7),
	// depends on autoSend
	sleepDay: new storage.SiInt([[0x7b]]),
	//   xxxxxxx0b - seconds relative to midnight/midday: 0 = am, 1 = pm
	//   xxxx000xb - day of week: 000 = Sunday, 110 = Saturday
	//   xx00xxxxb - week counter 0..3, relative to programming date
	sleepSeconds: new storage.SiInt([[0x7d], [0x7c]]),
	workingMinutes: new storage.SiInt([[0x7f], [0x7e]])
};
export const siStationStorageDefinition = storage.defineStorage(0x80, siStationStorageLocations);
// export type ISiStationStorageFields = storage.FieldsFromStorageDefinition<typeof siStationStorageDefinition>;
// export type ISiStationStorageFields = storage.FieldsFromStorageLocations<typeof siStationStorageLocations>;

export abstract class BaseSiStation<T extends SiTargetMultiplexerTarget> {
	public storage: storage.ISiStorage<ISiStationStorageFields>;

	protected static fromSiTargetMultiplexerWithGivenTarget<U extends SiTargetMultiplexerTarget>(
		multiplexer: ISiTargetMultiplexer,
		multiplexerTarget: U,
		createNewInstance: () => ISiStation<U>
	): ISiStation<U> {
		const existingStationObject = multiplexer.stations[multiplexerTarget] as ISiStation<U> | undefined;
		if (existingStationObject) {
			return existingStationObject;
		}
		const instance = createNewInstance();
		// @ts-expect-error - Assignment to indexed access requires bypassing readonly constraint on stations object
		multiplexer.stations[multiplexerTarget] = instance;
		// TODO: deregister/close
		return instance;
	}

	constructor(public siTargetMultiplexer: ISiTargetMultiplexer, public readonly multiplexerTarget: T) {
		this.storage = siStationStorageDefinition();
	}

	get ident(): string {
		const multiplexerTargetString = SiTargetMultiplexerTarget[this.multiplexerTarget];
		const deviceIdentString = this.siTargetMultiplexer.siDevice.ident;
		return `${multiplexerTargetString}-${deviceIdentString}`;
	}

	sendMessage(message: siProtocol.SiMessage, numResponses = 0, timeoutInMiliseconds = 10000): Promise<number[][]> {
		return this.siTargetMultiplexer.sendMessage(this.multiplexerTarget, message, numResponses, timeoutInMiliseconds);
	}

	readInfo(): Promise<void> {
		return this.sendMessage(
			{
				command: proto.cmd.GET_SYS_VAL,
				parameters: [0x00, 0x80]
			},
			1
		).then((data) => {
			this.storage.splice(0x00, 0x80, ...data[0].slice(3));
		});
	}

	getField<Field extends keyof ISiStationStorageFields>(infoName: Field): storage.ISiStorageLocations<ISiStationStorageFields>[Field] {
		return this.storage.locations[infoName];
	}

	getInfo<Field extends keyof ISiStationStorageFields>(infoName: Field): storage.ISiFieldValue<ISiStationStorageFields[Field]> | undefined {
		return this.storage.get(infoName);
	}

	setInfo<Field extends keyof ISiStationStorageFields>(infoName: Field, newValue: storage.ISiFieldValue<ISiStationStorageFields[Field]> | ISiStationStorageFields[Field]): void {
		this.storage.set(infoName, newValue);
	}

	writeChanges(): Promise<void> {
		const newStorage = this.storage.data;
		return this.readInfo().then(() => {
			const oldStorage = this.storage.data;
			return this.writeDiff(oldStorage, newStorage);
		});
	}

	atomically(doThings: () => void): Promise<void> {
		return this.readInfo().then(() => {
			const oldStorage = this.storage.data;
			doThings();
			const newStorage = this.storage.data;
			return this.writeDiff(oldStorage, newStorage);
		});
	}

	writeDiff(oldStorage: storage.ISiStorageData, newStorage: storage.ISiStorageData): Promise<void> {
		const zippedStorageBytes = oldStorage.zip(newStorage);
		const isByteDirty = zippedStorageBytes.map((oldAndNew: [unknown, unknown]) => oldAndNew[0] !== oldAndNew[1]);
		const dirtyRanges = isByteDirty.reduce((ranges: [number, number][], isDirty: boolean, byteIndex: number): [number, number][] => {
			if (!isDirty) {
				return ranges;
			}
			const numRanges = ranges.length;
			const lastRange = ranges[numRanges - 1];
			if (lastRange && lastRange[1] === byteIndex) {
				return [...ranges.slice(0, numRanges - 1), [lastRange[0], byteIndex + 1]];
			}
			return [...ranges, [byteIndex, byteIndex + 1]];
		}, [] as [number, number][]);
		let dirtyRangeIndex = 0;
		const processDirtyRanges = (): Promise<void> => {
			if (dirtyRangeIndex >= dirtyRanges.length) {
				return Promise.resolve();
			}
			const dirtyRange = dirtyRanges[dirtyRangeIndex];
			const parameters = [dirtyRange[0], ...newStorage.slice(dirtyRange[0], dirtyRange[1])] as number[];
			return this.sendMessage(
				{
					command: proto.cmd.SET_SYS_VAL,
					parameters: parameters
				},
				1
			).then((d) => {
				const data = d[0];
				data.splice(0, 2);
				if (data[0] !== parameters[0]) {
					logger.warn('SET_SYS_VAL error', { actual: data[0], expected: parameters[0] });
				}
				dirtyRangeIndex += 1;
				return processDirtyRanges();
			});
		};
		return processDirtyRanges();
	}

	

	getTime(): Promise<Date | undefined> {
		return this.sendMessage(
			{
				command: proto.cmd.GET_TIME,
				parameters: []
			},
			1
		).then((d) => siProtocol.arr2date(d[0].slice(2)));
	}

	setTime(newTime: Date): Promise<Date | undefined> {
		// TODO: compensate for waiting time
		return this.sendMessage(
			{
				command: proto.cmd.SET_TIME,
				parameters: [...siProtocol.date2arr(newTime)]
			},
			1
		).then((d) => siProtocol.arr2date(d[0].slice(2)));
	}

	signal(countArg: number): Promise<void> {
		const count = countArg < 1 ? 1 : countArg;
		return this.sendMessage(
			{
				command: proto.cmd.SIGNAL,
				parameters: [count]
			},
			1
		).then((data) => {
			if (data[0][2] !== count) {
				throw new Error('NUM BEEPS');
			}
		});
	}

	powerOff(): Promise<number[][]> {
		// Does not power off BSM8 (USB powered), though
		return this.sendMessage(
			{
				command: proto.cmd.OFF,
				parameters: []
			},
			0
		);
	}

	// --- Card Write Operations ---

	/** Write a 4-byte word to a SIAC/Card11 card at the given address.
	 *  DLL: SetSiacCardData / _cmdSetSiacData
	 *  Protocol: command 0xEA (WRITE_CARDX_WORD), payload [address, d0, d1, d2, d3]
	 *  Supported addresses: 0x06, 0x2B, 0x6C, 0x6F, 0x73, 0x75, 0x7E */
	setSiacCardData(address: number, data: number[]): Promise<void> {
		const VALID_ADDRESSES = [0x06, 0x2B, 0x6C, 0x6F, 0x73, 0x75, 0x7E];
		if (!VALID_ADDRESSES.includes(address)) {
			return Promise.reject(new Error(`Address 0x${address.toString(16)} not supported for SIAC card data`));
		}
		if (data.length !== 4) {
			return Promise.reject(new Error('Data must be exactly 4 bytes'));
		}
		return this.sendMessage(
			{
				command: proto.cmd.SET_SI8,
				parameters: [address, ...data]
			},
			1
		).then(() => undefined);
	}

	/** Set the feedback signal on a Card11 or SIAC card.
	 *  DLL: _getFeedbackSignalSetting + SetSiacCardData at address 0x73 */
	setCardFeedbackSignal(feedbackSignal: 'default' | 'short' | 'long' | 'blinkOnly', cardType: 'Card11' | 'SIAC'): Promise<void> {
		const FEEDBACK_SIAC: { [key: string]: number[] } = {
			short:    [0x06, 0x00, 0x05, 0x4A],
			long:     [0x30, 0x00, 0x05, 0x4A],
			default:  [0x18, 0x00, 0x05, 0x4A],
			blinkOnly:[0x20, 0x00, 0x66, 0x00],
		};
		const FEEDBACK_CARD11: { [key: string]: number[] } = {
			short:   [0x10, 0x00, 0x09, 0x00],
			long:    [0x40, 0x00, 0x09, 0x00],
			default: [0x20, 0x00, 0x09, 0x00],
		};
		const feedbackMap = cardType === 'Card11' ? FEEDBACK_CARD11 : FEEDBACK_SIAC;
		const feedbackBytes = feedbackMap[feedbackSignal] || feedbackMap['default'];
		return this.setSiacCardData(0x73, feedbackBytes);
	}

	/** Write personal data to a modern SI card (Card8/9/10/11/SIAC/PCard/TCard).
	 *  DLL: _cmdSetCardPersonalDataAndFeedbackSignal (modern card path)
	 *  Data is semicolon-delimited: "FirstName;LastName;Sex;Birthday;Club;Email;Phone;City;Street;Zip;Country;"
	 *  Written as 4-byte words starting at word address 8, padded with 0xEE. */
	writeModernCardPersonalData(personalDataString: string): Promise<void> {
		const rawBytes = Array.from(personalDataString, (c) => c.charCodeAt(0) & 0xFF);
		const paddedLen = Math.max(4, Math.ceil(rawBytes.length / 4) * 4);
		const padded = new Array(paddedLen).fill(0xEE);
		for (let i = 0; i < Math.min(rawBytes.length, paddedLen); i++) {
			padded[i] = rawBytes[i];
		}

		let wordAddr = 8;
		let promise = Promise.resolve();
		for (let offset = 0; offset < padded.length; offset += 4) {
			const word = [padded[offset], padded[offset + 1], padded[offset + 2], padded[offset + 3]];
			const addr = wordAddr++;
			promise = promise.then(() =>
				this.sendMessage(
					{
						command: proto.cmd.SET_SI8,
						parameters: [addr, ...word]
					},
					1
				).then(() => undefined)
			);
		}
		return promise;
	}

	/** Write personal data to a SI-Card 6 using fixed-width fields.
	 *  DLL: _cmdSetCardPersonalDataAndFeedbackSignal (Card6 path)
	 *  Uses SET_SI6 (0xE2) for 16-byte pages and SET_SI6_SPECIAL (0xE4) for 4-byte words. */
	writeCard6PersonalData(fields: {
		lastName?: string; firstName?: string; country?: string; club?: string;
		phone?: string; email?: string; street?: string; city?: string;
		zip?: string; sex?: string; birthday?: string;
	}): Promise<void> {
		const padField = (text: string | undefined, length: number): number[] => {
			const buf = new Array(length).fill(0x20);
			if (text) {
				for (let i = 0; i < Math.min(text.length, length); i++) {
					buf[i] = text.charCodeAt(i) & 0xFF;
				}
			}
			return buf;
		};

		const lastName = padField(fields.lastName, 20);
		const firstName = padField(fields.firstName, 20);
		const country = padField(fields.country, 4);
		const club = padField(fields.club, 36);
		const phone = padField(fields.phone, 16);
		const email = padField(fields.email, 36);
		const street = padField(fields.street, 20);
		const city = padField(fields.city, 16);
		const zip = padField(fields.zip, 8);
		const sex = padField(fields.sex ? fields.sex.substring(0, 1).padStart(4, '0') : '0000', 4);
		const birthday = padField(fields.birthday, 8);

		// Build page writes: SET_SI6 (0xE2) sends [blockNum, pageNum, ...16 bytes]
		const pages: { command: number; parameters: number[] }[] = [
			{ command: proto.cmd.SET_SI6, parameters: [0x00, 0x03, ...lastName.slice(0, 16)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x00, 0x04, ...lastName.slice(16, 20), ...firstName.slice(0, 12)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x00, 0x05, ...firstName.slice(12, 20), ...country.slice(0, 4), ...club.slice(0, 4)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x00, 0x06, ...club.slice(4, 20)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x00, 0x07, ...club.slice(20, 36)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x01, 0x01, ...phone.slice(0, 16)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x01, 0x02, ...email.slice(0, 16)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x01, 0x03, ...email.slice(16, 32)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x01, 0x04, ...email.slice(32, 36), ...street.slice(0, 12)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x01, 0x05, ...street.slice(12, 20), ...city.slice(0, 8)] },
			{ command: proto.cmd.SET_SI6, parameters: [0x01, 0x06, ...city.slice(8, 16), ...zip.slice(0, 8)] },
			// SET_SI6_SPECIAL (0xE4) for 4-byte words in block 1 page 7
			{ command: proto.cmd.SET_SI6_SPECIAL, parameters: [0x01, 0x07, ...sex.slice(0, 4)] },
			{ command: proto.cmd.SET_SI6_SPECIAL, parameters: [0x01, 0x07, 0x01, ...birthday.slice(0, 4)] },
			{ command: proto.cmd.SET_SI6_SPECIAL, parameters: [0x01, 0x07, 0x02, ...birthday.slice(4, 8)] },
		];

		let promise = Promise.resolve();
		for (const page of pages) {
			promise = promise.then(() =>
				this.sendMessage(page, 1).then(() => undefined)
			);
		}
		return promise;
	}

	eraseBackupData(): Promise<void> {
		return this.sendMessage(
			{
				command: proto.cmd.ERASE_BDATA,
				parameters: []
			},
			1
		).then(() => undefined);
	}

	setBaudRate(baudRate: number): Promise<void> {
		// DLL: baudRate >= 38400 -> parameter 0x00, else 0x01
		const param = baudRate >= 38400 ? 0x00 : 0x01;
		return this.sendMessage(
			{
				command: proto.cmd.SET_BAUD,
				parameters: [param]
			},
			1
		).then(() => undefined);
	}
}
