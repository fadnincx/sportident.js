import * as storage from '../../storage';
import * as siProtocol from '../../siProtocol';
import { proto } from '../../constants';
import {
	type IModernSiCardStorageFields,
	ModernSiCard,
	modernSiCardStorageLocations
} from './ModernSiCard';
import { BaseSiCard } from '../BaseSiCard';

export const SIACBatteryStatus = {
	OK: 0xaa,
	LOW: 0x6c,
};

export interface ISIACStorageFields extends IModernSiCardStorageFields {
	productionMonth: number;
	productionYear: number;
	hardwareVersionMajor: number;
	hardwareVersionMinor: number;
	softwareVersionMajor: number;
	softwareVersionMinor: number;
	batteryDate: Date;
	batteryVoltage: number;
	batteryRefV: number;
	batteryStatus: keyof typeof SIACBatteryStatus;
}

const bytesPerPage = 128;

export const siacStorageLocations: storage.ISiStorageLocations<ISIACStorageFields> = {
	...modernSiCardStorageLocations,
	productionMonth: new storage.SiInt([[0x1c]]),
	productionYear: new storage.SiInt([[0x1d]]),
	hardwareVersionMajor: new storage.SiInt([[0x1c0]]),
	hardwareVersionMinor: new storage.SiInt([[0x1c1]]),
	softwareVersionMajor: new storage.SiInt([[0x1c2]]),
	softwareVersionMinor: new storage.SiInt([[0x1c3]]),
	batteryDate: new storage.SiModified(
		new storage.SiDict({
			year: new storage.SiInt([[0x1bc]]),
			month: new storage.SiInt([[0x1bd]]),
			day: new storage.SiInt([[0x1be]]),
		}),
		(data) => {
			if (data.year === undefined || data.month === undefined || data.day === undefined) {
				return undefined;
			}
			if (data.year === 0 && data.month === 0 && data.day === 0) {
				return undefined;
			}
			return new Date(2000 + data.year, data.month - 1, data.day);
		}
	),
	batteryVoltage: new storage.SiInt([[0x1c7]]),
	batteryRefV: new storage.SiInt([[0x1d4]]),
	batteryStatus: new storage.SiEnum([[0x1d5]], SIACBatteryStatus),
};

export const siacStorageDefinition = storage.defineStorage(0x400, siacStorageLocations);

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

	public storage: storage.ISiStorage<ISIACStorageFields>;

	public productionMonth?: number;
	public productionYear?: number;
	public hardwareVersionMajor?: number;
	public hardwareVersionMinor?: number;
	public softwareVersionMajor?: number;
	public softwareVersionMinor?: number;
	public batteryDate?: Date;
	public batteryVoltage?: number;
	public batteryRefV?: number;
	public batteryStatus?: keyof typeof SIACBatteryStatus;

	constructor(cardNumber: number) {
		super(cardNumber);
		this.storage = siacStorageDefinition();
	}

	typeSpecificRead(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.typeSpecificReadBasic()
				.then(() => this.typeSpecificReadCardHolder())
				.then(() => this.typeSpecificReadPunches())
				.then(() => this.typeSpecificReadBattery())
				.then(() => {
					this.punchCount = this.storage.get('punchCount')?.value;
					this.cardSeries = this.storage.get('cardSeries')?.value;
					this.productionMonth = this.storage.get('productionMonth')?.value;
					this.productionYear = this.storage.get('productionYear')?.value;
					this.hardwareVersionMajor = this.storage.get('hardwareVersionMajor')?.value;
					this.hardwareVersionMinor = this.storage.get('hardwareVersionMinor')?.value;
					this.softwareVersionMajor = this.storage.get('softwareVersionMajor')?.value;
					this.softwareVersionMinor = this.storage.get('softwareVersionMinor')?.value;
					this.batteryDate = this.storage.get('batteryDate')?.value;
					this.batteryVoltage = this.storage.get('batteryVoltage')?.value;
					this.batteryRefV = this.storage.get('batteryRefV')?.value;
					this.batteryStatus = this.storage.get('batteryStatus')?.value;

					this.raceResult = {
						cardNumber: this.storage.get('cardNumber')?.value || 0,
						startTime: this.storage.get('startTime')?.value,
						finishTime: this.storage.get('finishTime')?.value,
						checkTime: this.storage.get('checkTime')?.value,
						punches: this.storage.get('punches')?.value,
						cardHolder: this.storage.get('cardHolder')?.value,
						siac: {
							productionDate: this.getProductionDate(),
							hardwareVersion: this.getHardwareVersion(),
							softwareVersion: this.getSoftwareVersion(),
							battery: {
								date: this.batteryDate,
								voltage: this.getBatteryVoltageV(),
								referenceVoltage: this.getBatteryRefVoltageV(),
								status: this.batteryStatus,
							},
						},
					};
					resolve();
				})
				.catch((exc: Error) => reject(exc));
		});
	}

	typeSpecificReadBattery(): Promise<void> {
		return this.triggerBatteryMeasurement()
			.then(() => this.typeSpecificGetPage(3))
			.then((page3: number[]) => {
				this.storage.splice(bytesPerPage * 3, bytesPerPage, ...page3);
				this.emitProgress('battery', 3);
			});
	}

	private triggerBatteryMeasurement(): Promise<void> {
		if (!this.mainStation) {
			return Promise.reject(new Error('No main station'));
		}
		return this.mainStation
			.sendMessage(
				{
					command: proto.cmd.SET_SI8,
					parameters: [0x7e, 0x05, 0x05, 0x05, 0x05]
				},
				1
			)
			.then(() => {});
	}

	getMaxReadSteps(): number {
		return 8; // pages 0, 1, measurement, 3, 4, 5, 6, 7
	}

	getBatteryVoltageV(): number | undefined {
		if (this.batteryVoltage === undefined) {
			return undefined;
		}
		return 1.9 + (this.batteryVoltage * 0.09);
	}

	getBatteryRefVoltageV(): number | undefined {
		if (this.batteryRefV === undefined) {
			return undefined;
		}
		return 1.9 + (this.batteryRefV * 0.09);
	}

	getProductionDate(): Date | undefined {
		if (this.productionMonth === undefined || this.productionYear === undefined) {
			return undefined;
		}
		if (this.productionMonth === 0 && this.productionYear === 0) {
			return undefined;
		}
		return new Date(2000 + this.productionYear, this.productionMonth - 1, 1);
	}

	getHardwareVersion(): string | undefined {
		if (this.hardwareVersionMajor === undefined || this.hardwareVersionMinor === undefined) {
			return undefined;
		}
		return `${this.hardwareVersionMajor}.${this.hardwareVersionMinor}`;
	}

	getSoftwareVersion(): string | undefined {
		if (this.softwareVersionMajor === undefined || this.softwareVersionMinor === undefined) {
			return undefined;
		}
		return `${this.softwareVersionMajor}.${this.softwareVersionMinor}`;
	}
}
BaseSiCard.registerNumberRange(8000000, 9000000, SIAC);
