import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { countTokens } from "./countTokens.js";


type OutputWriter = {
	write: (text: string) => Promise<void>;
	writeLine: (text: string) => Promise<void>;
	getStats: () => { sizeBytes: number; tokenCount: number };
	close: () => Promise<{ sizeBytes: number; tokenCount: number }>;
};

export async function createOutputWriter(
	outputFile: string,
	maxSizeBytes = 0
): Promise<OutputWriter> {
	const outputDirectory = dirname(outputFile);
	if (outputDirectory !== ".")
		await mkdir(outputDirectory, { recursive: true });
	
	const stream = createWriteStream(outputFile, { encoding: "utf8" });
	let bytesWritten = 0;
	let totalTokenCount = 0;
	
	const write = async (text: string): Promise<void> => {
		const textBytes = Buffer.byteLength(text);
		
		if (maxSizeBytes > 0 && bytesWritten + textBytes > maxSizeBytes)
			throw new Error(`Output size would exceed maximum of ${maxSizeBytes} bytes`);
		
		bytesWritten += textBytes;
		totalTokenCount += countTokens(text);
		
		if (!stream.write(text))
			await once(stream, "drain");
	};
	
	return {
		write,
		writeLine: (text: string) => write(`${text}\n`),
		getStats: () => ({ sizeBytes: bytesWritten, tokenCount: totalTokenCount }),
		close: () =>
			new Promise((resolve, reject) => {
				stream.end((error?: Error | null) => {
					if (error)
						reject(error);
					else
						resolve({ sizeBytes: bytesWritten, tokenCount: totalTokenCount });
				});
			})
	};
}
