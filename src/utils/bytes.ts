export const isByte = (byte: unknown): boolean => Number(byte) === byte && Math.floor(byte) === byte && byte <= 0xff && byte >= 0x00;

export const isByteArr = (arr: unknown[]): boolean => Array.isArray(arr) && !arr.some((e) => !isByte(e));

export const assertIsByteArr = (arr: unknown[]): void => {
	if (!isByteArr(arr)) {
		throw new Error(`${arr} is not a byte array`);
	}
};

export const isArrOfLengths = (arr: unknown[], lengths: number[]): boolean => {
	const actualLength = arr.length;
	return lengths.some((length) => actualLength === length);
};

export const assertArrIsOfLengths = (arr: unknown[], lengths: number[]): void => {
	if (!isArrOfLengths(arr, lengths)) {
		throw new Error(`${arr} is not of lengths ${lengths}`);
	}
};

export const arr2big = (arr: number[]): number => {
	assertIsByteArr(arr);
	let outnum = 0;
	for (let i = 0; i < arr.length; i++) {
		const byte = arr[i];
		outnum += byte * Math.pow(0x100, arr.length - i - 1);
	}
	return outnum;
};

export const prettyHex = (input: string | (number | undefined)[], lineLength = 0): string => {
	let iterable = input;
	if (typeof input === 'string') {
		iterable = [];
		for (let strIndex = 0; strIndex < input.length; strIndex++) {
			iterable.push(input.charCodeAt(strIndex));
		}
	}
	const prettyBytes = [...(iterable as (number | undefined)[])].map((byte) => (byte !== undefined ? `00${byte.toString(16)}` : '??')).map((paddedStr) => paddedStr.slice(-2).toUpperCase());
	if (lineLength === 0) {
		return prettyBytes.join(' ');
	}
	const lines = [];
	for (let lineIndex = 0; lineIndex < prettyBytes.length / lineLength; lineIndex++) {
		const startIndex = lineIndex * lineLength;
		const endIndex = (lineIndex + 1) * lineLength;
		const line = prettyBytes.slice(startIndex, endIndex).join(' ');
		lines.push(line);
	}
	return lines.join('\n');
};

export const unPrettyHex = (input: string): Array<number | undefined> => {
	const hexString = input.replace(/\s/g, '');
	if (hexString.length % 2 !== 0) {
		throw new Error('Hex String length must be even');
	}
	const byteArray = [];
	for (let byteIndex = 0; byteIndex < hexString.length / 2; byteIndex++) {
		const hexByteString = hexString.substr(byteIndex * 2, 2);
		const byteValue = hexByteString === '??' ? undefined : parseInt(hexByteString, 16);
		if (byteValue !== undefined && (!Number.isInteger(byteValue) || byteValue < 0 || byteValue > 255)) {
			throw new Error(`Invalid hex: ${hexByteString}`);
		}
		byteArray.push(byteValue);
	}
	return byteArray;
};
