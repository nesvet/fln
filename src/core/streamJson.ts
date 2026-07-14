import { streamTextFileToWriter } from "./textStream.js";
import type { TextEncodingMode } from "./types.js";

type JsonWriter = {
	write: (text: string) => Promise<void>;
};

export function escapeJsonStringValue(text: string): string {
	let result = "";
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;

		switch (char) {
			case '"': {
				result += String.raw`\"`;
				break;
			}
			case "\\": {
				result += "\\\\";
				break;
			}
			case "\n": {
				result += String.raw`\n`;
				break;
			}
			case "\r": {
				result += String.raw`\r`;
				break;
			}
			case "\t": {
				result += String.raw`\t`;
				break;
			}
			default:
				if (code < 0x20)
					result += String.raw`\u${code.toString(16).padStart(4, "0")}`;
				else result += char;
		}
	}

	return result;
}

export async function writeJsonStringField(
	writer: JsonWriter,
	fieldName: string,
	value: string,
	options: { leadingComma?: boolean } = {},
): Promise<void> {
	if (options.leadingComma) await writer.write(",");

	await writer.write(`"${fieldName}":`);
	await writer.write('"');

	const chunkSize = 64 * 1024;
	for (let offset = 0; offset < value.length; offset += chunkSize) {
		const chunk = value.slice(offset, offset + chunkSize);
		await writer.write(escapeJsonStringValue(chunk));
	}

	await writer.write('"');
}

export async function writeJsonContentFromPath(
	writer: JsonWriter,
	filePath: string,
	encoding: TextEncodingMode,
	options: { leadingComma?: boolean; onChunk?: (chunk: string) => void } = {},
): Promise<{ hadReplacement: boolean }> {
	if (options.leadingComma) await writer.write(",");

	await writer.write('"content":');
	await writer.write('"');

	const { hadReplacement } = await streamTextFileToWriter(
		filePath,
		encoding,
		async (chunk) => {
			options.onChunk?.(chunk);
			await writer.write(escapeJsonStringValue(chunk));
		},
	);

	await writer.write('"');

	return { hadReplacement };
}
