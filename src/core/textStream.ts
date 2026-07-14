import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { decodeBuffer } from "./fileContent.js";
import type { TextEncodingMode } from "./types.js";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const streamThresholdBytes = 256 * 1024;

export type TextChunkHandler = (chunk: string) => Promise<void> | void;

export async function streamTextFileToWriter(
	filePath: string,
	encoding: TextEncodingMode,
	onChunk: TextChunkHandler,
): Promise<{ hadReplacement: boolean }> {
	const fileStats = await stat(filePath);

	if (fileStats.size <= streamThresholdBytes || encoding === "latin1") {
		const buffer = await readFile(filePath);
		const { text, hadReplacement } = decodeBuffer(buffer, encoding);
		await onChunk(text);

		return { hadReplacement };
	}

	const header = await readFile(filePath, { encoding: null });
	const bomLength =
		header.length >= 3 && header.subarray(0, 3).equals(UTF8_BOM) ? 3 : 0;
	const streamEncoding = "utf8";
	let hadReplacement = false;

	const stream = createReadStream(filePath, {
		encoding: streamEncoding,
		start: bomLength,
	});

	for await (const chunk of stream) {
		const text =
			typeof chunk === "string" ? chunk : chunk.toString(streamEncoding);
		if (text.includes("\uFFFD")) hadReplacement = true;
		await onChunk(chunk as string);
	}

	return { hadReplacement };
}
