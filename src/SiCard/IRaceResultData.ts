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
	signalCount?: number;       // feedback cycle counter
	clearCount?: number;        // clear counter
}

export interface IRaceResultData {
	cardNumber?: number;
	cardHolder?: { [property: string]: unknown };
	clearTime?: siProtocol.SiTimestamp;
	checkTime?: siProtocol.SiTimestamp;
	startTime?: siProtocol.SiTimestamp;
	finishTime?: siProtocol.SiTimestamp;
	punches?: IPunch[];

	// Reserve Time slots
	startReserveTime?: siProtocol.SiTimestamp;
	finishReserveTime?: siProtocol.SiTimestamp;

	// Card-specific extensions
	siac?: ISIACInfo;
}

export interface IPunch {
	code: number;
	time: siProtocol.SiTimestamp;

	// Per-punch detail, only reported by the Reader BT
	punchType?: number;    // raw punch_type
	controlInfo?: number;  // raw control_info byte
	stationMode?: number;  // mode of the recording station, see SiStationMode
	beaconMode?: boolean;  // xx1xxxxxb punching mode, xx0xxxxxb timing mode
	radioMode?: number;    // 00xxxxxxb..11xxxxxxb, see ReaderBtRadioMode
}
