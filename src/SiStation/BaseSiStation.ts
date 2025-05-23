import { proto } from '../constants';
import * as storage from '../storage';
import * as siProtocol from '../siProtocol';
import { type ISiStation, SiStationMode, SiStationModel } from './ISiStation';
import { type ISiTargetMultiplexer, SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';

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
		// @ts-ignore
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
					console.warn(`SET_SYS_VAL error: ${data[0]} (expected ${parameters[0]})`);
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
}
