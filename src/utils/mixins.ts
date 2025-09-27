// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const applyMixins = (derivedCtor: any, baseCtors: any[]): void => {
	baseCtors.forEach((baseCtor) => {
		Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
			Object.defineProperty(
				derivedCtor.prototype,
				name,
				// @ts-expect-error - PropertyDescriptor from getOwnPropertyDescriptor may be undefined but defineProperty accepts it
				Object.getOwnPropertyDescriptor(baseCtor.prototype, name)
			);
		});
	});
};
