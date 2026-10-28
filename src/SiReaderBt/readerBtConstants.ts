// Reader BT (device type 0x00A7). BLE only, does not speak the SI serial protocol.
// Spec: https://docs.sportident.com/developers/reader-bt

// All Reader BT UUIDs follow bd5100xx-6aec-4628-a146-f3e95bc49e62
export const readerBtUuid = (xx: number): string => `bd5100${xx.toString(16).padStart(2, '0')}-6aec-4628-a146-f3e95bc49e62`;

export const readerBtServices = {
	settings: readerBtUuid(0x01),
	card: readerBtUuid(0x11),
	sessions: readerBtUuid(0x31)
};

// Characteristics are addressed by these names rather than by UUID, so a native driver
// can map them onto its own handles.
export type ReaderBtCharacteristicId = 'readSettings' | 'writeSettings' | 'cardState' | 'cardData' | 'sessions';

export const readerBtCharacteristics: {
	[Id in ReaderBtCharacteristicId]: { uuid: string; service: string; notifies: boolean };
} = {
	readSettings: { uuid: readerBtUuid(0x02), service: readerBtServices.settings, notifies: true }, // notify, write w/ response
	writeSettings: { uuid: readerBtUuid(0x03), service: readerBtServices.settings, notifies: false }, // write w/ and w/o response
	cardState: { uuid: readerBtUuid(0x12), service: readerBtServices.card, notifies: true }, // notify
	cardData: { uuid: readerBtUuid(0x13), service: readerBtServices.card, notifies: true }, // notify, write w/ response
	sessions: { uuid: readerBtUuid(0x32), service: readerBtServices.sessions, notifies: true } // notify, write w/ response
};

export const readerBtCharacteristicIds = Object.keys(readerBtCharacteristics) as ReaderBtCharacteristicId[];

export const readerBtNotifyCharacteristicIds = readerBtCharacteristicIds.filter((id) => readerBtCharacteristics[id].notifies);

export const READER_BT_DEVICE_TYPE = 0x00a7; // as reported by ReadDeviceInfo
export const READER_BT_ADVERTISING_SECONDS = 20; // after a Service/OFF instruction card

export const READER_BT_NAME_PREFIX = 'Reader BT';

// Message ids. Reader > Client unless noted otherwise.
export const msg = {
	CARD_STATE_CHANGE: 0x1101, // card inserted or removed
	CARD_READOUT_MINIMAL: 0x1102, // both the request and the response
	CARD_READOUT_COMPLETE: 0x1103, // both the request and the response
	FEEDBACK: 0x1110, // Client > Reader, triggers LED/buzzer
	READ_ALL_SETTINGS: 0x010c, // request has an empty payload
	WRITE_ALL_SETTINGS: 0x010d, // Client > Reader, acknowledgement unverified
	READ_DEVICE_INFO: 0x010e, // request has an empty payload
	SET_AUTOSEND: 0x010f, // Client > Reader, per connection, no response
	READ_AUTOSEND: 0x0110, // request has an empty payload
	READ_SESSIONS: 0x3101, // Client > Reader, one page of the session lookup table
	READ_SESSION_DATA: 0x3102, // Client > Reader, the card readouts of one session
	SESSIONS_RESPONSE: 0x3103,
	SESSION_DATA_RESPONSE: 0x3104, // a header; the session's 0x1103 readouts follow it
	SEGMENT_WRAPPER: 0xa101 // carries one segment of a larger message
};

// No transaction ids exist, so a request is correlated with its response only by the
// message id the response is expected to carry. undefined = fire and forget.
export const RESPONSE_MESSAGE_ID_BY_REQUEST: { [requestMessageId: number]: number | undefined } = {
	[msg.READ_DEVICE_INFO]: msg.READ_DEVICE_INFO,
	[msg.READ_ALL_SETTINGS]: msg.READ_ALL_SETTINGS,
	[msg.WRITE_ALL_SETTINGS]: undefined,
	[msg.SET_AUTOSEND]: undefined,
	[msg.READ_AUTOSEND]: msg.READ_AUTOSEND,
	[msg.CARD_READOUT_MINIMAL]: msg.CARD_READOUT_MINIMAL,
	[msg.CARD_READOUT_COMPLETE]: msg.CARD_READOUT_COMPLETE,
	[msg.READ_SESSIONS]: msg.SESSIONS_RESPONSE,
	[msg.READ_SESSION_DATA]: msg.SESSION_DATA_RESPONSE,
	[msg.FEEDBACK]: undefined
};

// Sent on the reader's own initiative, never consumed by a pending request.
// Mirrors DIRECT_DEVICE_INITIATED_COMMANDS in SiTargetMultiplexer.
export const UNSOLICITED_MESSAGE_IDS: { [messageId: number]: boolean } = {
	[msg.CARD_STATE_CHANGE]: true
};

// Which characteristic a given request must be written to.
export const CHARACTERISTIC_BY_REQUEST: { [requestMessageId: number]: ReaderBtCharacteristicId } = {
	[msg.READ_DEVICE_INFO]: 'readSettings',
	[msg.READ_ALL_SETTINGS]: 'readSettings',
	[msg.WRITE_ALL_SETTINGS]: 'writeSettings',
	[msg.SET_AUTOSEND]: 'writeSettings',
	[msg.READ_AUTOSEND]: 'readSettings',
	[msg.CARD_READOUT_MINIMAL]: 'cardData',
	[msg.CARD_READOUT_COMPLETE]: 'cardData',
	[msg.FEEDBACK]: 'cardData',
	[msg.READ_SESSIONS]: 'sessions',
	[msg.READ_SESSION_DATA]: 'sessions'
};

export enum ReaderBtSegmentFlag {
	Subsequent = 0x00,
	First = 0x01,
	Last = 0x02
}

export enum ReaderBtCardState {
	Out = 0,
	In = 1
}

// 15 is not SIAC specifically: it is SI3 = 0x0f, shared by SiCard10, SiCard11 and SIAC,
// which are distinguished by card number range. See getModernSiCardSeries.
export enum ReaderBtCardFamily {
	SiCard9 = 1,
	SiCard8 = 2,
	PCard = 4,
	Modern = 15
}

export enum ReaderBtPunchType {
	Clear = 1,
	Check = 2,
	Start = 3,
	StartReserve = 4,
	Finish = 5,
	FinishReserve = 6,
	Control = 7
}

// control_info bits 6-7 of a punch record, 0x00 on non-SIAC cards
export enum ReaderBtRadioMode {
	No = 0,
	Last = 1,
	All = 2,
	AllNew = 3
}

// Byte 2 of the settings, persisted on the reader. Changing it away from Readout while
// a client is connected terminates the BLE connection.
export enum ReaderBtOperatingMode {
	Readout = 0x05,
	Printout = 0x0b,
	Standalone = 0x0c
}

export enum ReaderBtFeedbackType {
	Ok = 1,
	Error = 2
}

// The ids as the spec names them. Cards tagged Iso8859_1 really hold CP850 (ü = 0x81),
// which is what the official tools write and print, so that is how they are decoded.
export enum ReaderBtCharacterSet {
	Iso8859_1 = 1,
	Gb2312 = 17
}

// control_info is the mode of the station that recorded the punch (see SiStationMode:
// 0x07 Clear, 0x32 BeaconControl, 0x34 BeaconFinish on a real SIAC), plus the radio
// mode in bits 6-7. Bit 5 is what sets the Beacon* modes apart: set = punching mode,
// clear = timing mode.
export const CONTROL_INFO_STATION_MODE_MASK = 0x3f;
export const CONTROL_INFO_BEACON_PUNCHING_MASK = 0x20;
export const CONTROL_INFO_RADIO_MODE_MASK = 0xc0;
export const CONTROL_INFO_RADIO_MODE_SHIFT = 6;

export const PUNCH_RECORD_LENGTH = 8;
export const MESSAGE_HEADER_LENGTH = 4;
export const SESSION_ENTRY_LENGTH = 20;
export const SIAC_PRODUCTION_DATA_LENGTH = 13;

// Sessions are stored in a circular buffer and paginated, newest first.
export const MAX_SESSIONS = 291;
export const SESSIONS_PER_PAGE = 5;

// Owner data block sizes, not counting the leading character_set byte that real readers
// send (SI-Card 9: 1 + 24, SIAC: 1 + 128). Parsing still accepts a block without it.
export const OWNER_DATA_LENGTHS = [24, 104, 128];

// Card numbers in this range carry the 13-byte SIAC production data block.
export const SIAC_CARD_NUMBER_MIN = 8000000;
export const SIAC_CARD_NUMBER_MAX = 9000000;

export const MS_PER_SECOND = 1000;
export const MS_PER_DAY = 86400000;
export const MS_PER_WEEK = 604800000;
export const SECONDS_PER_DAY = 86400;
