import { open, readFile, stat } from "node:fs/promises";
import { detectSecretsInBuffer } from "./securityMatcher.js";
import type { TextEncodingMode } from "./types.js";

type FileContentTestHooks = {
	onReadTextFile?: (filePath: string) => void;
};

let fileContentTestHooks: FileContentTestHooks | undefined;

type CheckToctouTestHook = (
	filePath: string,
	scanMtimeMs: number,
	scanSize: number,
) => Promise<boolean | undefined>;

let checkToctouTestHook: CheckToctouTestHook | undefined;

export function setCheckToctouTestHook(
	hook: CheckToctouTestHook | undefined,
): void {
	checkToctouTestHook = hook;
}

export function setFileContentTestHooks(
	hooks: FileContentTestHooks | undefined,
): void {
	fileContentTestHooks = hooks;
}

const FLN_GENERATED_MARKER = "<!-- 🥞 fln";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff]);

export function computeMaxBacktickRun(text: string): number {
	let maxLength = 0;
	let currentLength = 0;

	for (const char of text)
		if (char === "`") {
			currentLength++;
			maxLength = Math.max(maxLength, currentLength);
		} else currentLength = 0;

	return maxLength;
}

function decodeUtf16(buffer: Buffer, littleEndian: boolean): string {
	const body = buffer.subarray(2);
	const chars: string[] = [];
	const step = 2;

	for (let index = 0; index + 1 < body.length; index += step) {
		const code = littleEndian
			? body[index] | (body[index + 1] << 8)
			: (body[index] << 8) | body[index + 1];
		chars.push(String.fromCodePoint(code));
	}

	return chars.join("");
}

export function decodeBuffer(
	buffer: Buffer,
	encoding: TextEncodingMode,
): { text: string; hadReplacement: boolean } {
	if (buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM)) {
		const text = buffer.subarray(3).toString("utf8");

		return { text, hadReplacement: text.includes("\uFFFD") };
	}

	if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16_LE_BOM))
		return { text: decodeUtf16(buffer, true), hadReplacement: false };

	if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16_BE_BOM))
		return { text: decodeUtf16(buffer, false), hadReplacement: false };

	if (encoding === "latin1")
		return { text: buffer.toString("latin1"), hadReplacement: false };

	if (encoding === "utf8") {
		const text = buffer.toString("utf8");

		return { text, hadReplacement: text.includes("\uFFFD") };
	}

	const utf8Text = buffer.toString("utf8");
	if (!utf8Text.includes("\uFFFD"))
		return { text: utf8Text, hadReplacement: false };

	return { text: buffer.toString("latin1"), hadReplacement: true };
}

export async function readTextFile(
	filePath: string,
	encoding: TextEncodingMode = "auto",
): Promise<{ text: string; hadReplacement: boolean }> {
	fileContentTestHooks?.onReadTextFile?.(filePath);
	const buffer = await readFile(filePath);

	return decodeBuffer(buffer, encoding);
}

export const maxBacktickSampleBytes = 1_048_576;

export async function readMaxBacktickSample(
	filePath: string,
	fileSize: number,
	encoding: TextEncodingMode = "auto",
): Promise<number> {
	if (fileSize === 0) return 0;

	const handle = await open(filePath, "r");
	try {
		const sampleSize = Math.min(fileSize, maxBacktickSampleBytes);
		const buffer = Buffer.alloc(sampleSize);
		const { bytesRead } = await handle.read(buffer, 0, sampleSize, 0);
		const { text } = decodeBuffer(buffer.subarray(0, bytesRead), encoding);

		return computeMaxBacktickRun(text);
	} finally {
		await handle.close();
	}
}

function hasBinaryMagic(buffer: Buffer, bytesRead: number): boolean {
	if (bytesRead < 4) return false;

	const signatures: Buffer[] = [
		Buffer.from([0x89, 0x50, 0x4e, 0x47]),
		Buffer.from([0xff, 0xd8, 0xff]),
		Buffer.from([0x25, 0x50, 0x44, 0x46]),
		Buffer.from([0x50, 0x4b, 0x03, 0x04]),
		Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
		Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
		Buffer.from([0x1f, 0x8b]),
	];

	for (const signature of signatures)
		if (buffer.subarray(0, signature.length).equals(signature)) return true;

	return false;
}

export function analyzeTextFileHeader(
	buffer: Buffer,
	bytesRead: number,
	options: { strict?: boolean } = {},
): {
	isGenerated: boolean;
	isBinary: boolean;
	secretDetail?: string;
} {
	if (bytesRead === 0) return { isGenerated: false, isBinary: false };

	const headerUtf8 = buffer.toString("utf8", 0, Math.min(100, bytesRead));
	const isGenerated = headerUtf8.includes(FLN_GENERATED_MARKER);

	if (isGenerated) return { isGenerated: true, isBinary: false };

	if (bytesRead >= 2) {
		const bom = buffer.subarray(0, 2);
		if (bom.equals(UTF16_LE_BOM) || bom.equals(UTF16_BE_BOM))
			return { isGenerated: false, isBinary: false };
	}

	if (bytesRead >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM))
		return { isGenerated: false, isBinary: false };

	if (hasBinaryMagic(buffer, bytesRead))
		return { isGenerated: false, isBinary: true };

	const isBinary = buffer.slice(0, bytesRead).includes(0);

	if (!isBinary) {
		const secretResult = detectSecretsInBuffer(buffer, bytesRead, {
			strict: options.strict,
		});
		if (secretResult.detected)
			return {
				isGenerated: false,
				isBinary: false,
				secretDetail: secretResult.detail,
			};
	}

	return { isGenerated: false, isBinary };
}

export async function checkToctou(
	filePath: string,
	scanMtimeMs: number,
	scanSize: number,
): Promise<boolean> {
	const overridden = await checkToctouTestHook?.(
		filePath,
		scanMtimeMs,
		scanSize,
	);
	if (overridden !== undefined) return overridden;

	const current = await stat(filePath);

	return current.mtimeMs !== scanMtimeMs || current.size !== scanSize;
}
