export const getErrorOrThrow = (err: unknown): Error | SiError => {
	if (!(err instanceof Error) && !(err instanceof SiError)) {
		throw new Error('Thrown thing is not an error');
	}
	return err;
};

// Extends Error so String(error), `instanceof Error` and console output work as for any
// other error; it used to be a plain class and printed as "[object Object]".
export class SiError extends Error {
	constructor(message = '') {
		super(message);
		this.name = new.target.name;
	}
}

export class NotImplementedError extends SiError {}

export const notImplemented = (message?: string): never => {
	throw new NotImplementedError(message || 'Not implemented');
};
