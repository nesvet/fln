export type FlnErrorCode =
	| "CLIPBOARD_TOO_LARGE"
	| "CLIPBOARD_UNAVAILABLE"
	| "GIT_NOT_FOUND"
	| "GIT_REF_INVALID"
	| "INPUT_NOT_DIRECTORY"
	| "INVALID_CONFIG"
	| "LIMIT_EXCEEDED"
	| "NO_FILES_INCLUDED"
	| "READ_FAILED"
	| "TOCTOU"
	| "UPGRADE_FAILED";

export type FlnFailureJson = {
	ok: false;
	error: {
		code: FlnErrorCode;
		message: string;
		hint?: string;
		path?: string;
	};
};

export class FlnError extends Error {
	readonly code: FlnErrorCode;
	readonly hint?: string;
	readonly path?: string;

	constructor(
		code: FlnErrorCode,
		message: string,
		options: { hint?: string; path?: string } = {},
	) {
		super(message);
		this.name = "FlnError";
		this.code = code;
		this.hint = options.hint;
		this.path = options.path;
	}
}

export function flnError(
	code: FlnErrorCode,
	message: string,
	options: { hint?: string; path?: string } = {},
): FlnError {
	return new FlnError(code, message, options);
}

export function toFlnFailureJson(error: FlnError): FlnFailureJson {
	return {
		ok: false,
		error: {
			code: error.code,
			message: error.message,
			...(error.hint === undefined ? {} : { hint: error.hint }),
			...(error.path === undefined ? {} : { path: error.path }),
		},
	};
}
