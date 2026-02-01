import type * as siProtocol from '../siProtocol';

export interface ISIACBatteryInfo {
	date?: Date;
	voltage?: number;           // in Volts (converted)
	referenceVoltage?: number;  // in Volts (converted)
	status?: 'OK' | 'LOW';
}

export interface ISIACInfo {
	productionDate?: Date;
	hardwareVersion?: string;   // e.g., "1.6"
	softwareVersion?: string;   // e.g., "4.3"
	battery?: ISIACBatteryInfo;
}

export interface IRaceResultData {
	cardNumber?: number;
	cardHolder?: { [property: string]: unknown };
	clearTime?: siProtocol.SiTimestamp;
	checkTime?: siProtocol.SiTimestamp;
	startTime?: siProtocol.SiTimestamp;
	finishTime?: siProtocol.SiTimestamp;
	punches?: IPunch[];

	// Card-specific extensions
	siac?: ISIACInfo;
}

export interface IPunch {
	code: number;
	time: siProtocol.SiTimestamp;
}
