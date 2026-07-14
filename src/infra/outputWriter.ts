import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { isNullishOutput } from "../path/output.js";
import { countTokens } from "./countTokens.js";
import { flnError } from "./flnError.js";
import type { TokenModel } from "./tokenBudget.js";

type OutputWriter = {
	write: (text: string) => Promise<void>;
	writeLine: (text: string) => Promise<void>;
	getStats: () => { sizeBytes: number; tokenCount: number };
	wouldExceed: (text: string) => boolean;
	close: () => Promise<{ sizeBytes: number; tokenCount: number }>;
	discard: () => Promise<void>;
};

type CountTokensFn = (text: string) => number;

function createCountTokensFn(
	_tokenModel: TokenModel | undefined,
	counter?: CountTokensFn,
): CountTokensFn {
	if (counter) return counter;

	return (text: string) => countTokens(text);
}

export async function createOutputWriter(
	output: string,
	maxSizeBytes = 0,
	options: {
		tokenModel?: TokenModel;
		countTokensFn?: CountTokensFn;
		strictLimits?: boolean;
	} = {},
): Promise<OutputWriter> {
	const strictLimits = options.strictLimits ?? false;
	const countTokensForWrite = createCountTokensFn(
		options.tokenModel,
		options.countTokensFn,
	);

	if (output === "-") {
		let bytesWritten = 0;
		let totalTokenCount = 0;
		const write = async (text: string): Promise<void> => {
			const textBytes = Buffer.byteLength(text);
			if (
				strictLimits &&
				maxSizeBytes > 0 &&
				bytesWritten + textBytes > maxSizeBytes
			)
				throw flnError(
					"LIMIT_EXCEEDED",
					`Output size would exceed maximum of ${maxSizeBytes} bytes`,
				);
			bytesWritten += textBytes;
			totalTokenCount += countTokensForWrite(text);
			process.stdout.write(text);
		};

		return {
			write,
			writeLine: (text: string) => write(`${text}\n`),
			getStats: () => ({
				sizeBytes: bytesWritten,
				tokenCount: totalTokenCount,
			}),
			wouldExceed: (text: string) =>
				maxSizeBytes > 0 &&
				bytesWritten + Buffer.byteLength(text) > maxSizeBytes,
			close: async () => ({
				sizeBytes: bytesWritten,
				tokenCount: totalTokenCount,
			}),
			discard: () => Promise.resolve(),
		};
	}

	const outputDirectory = dirname(output);
	if (outputDirectory !== ".")
		await mkdir(outputDirectory, { recursive: true });

	const useAtomicWrite = !isNullishOutput(output);
	const tempPath = useAtomicWrite
		? `${output}.${randomBytes(4).toString("hex")}.tmp`
		: output;
	const stream = createWriteStream(tempPath, { encoding: "utf8" });
	let bytesWritten = 0;
	let totalTokenCount = 0;
	let finalized = false;

	const write = async (text: string): Promise<void> => {
		const textBytes = Buffer.byteLength(text);

		if (
			strictLimits &&
			maxSizeBytes > 0 &&
			bytesWritten + textBytes > maxSizeBytes
		)
			throw flnError(
				"LIMIT_EXCEEDED",
				`Output size would exceed maximum of ${maxSizeBytes} bytes`,
			);

		bytesWritten += textBytes;
		totalTokenCount += countTokensForWrite(text);

		if (!stream.write(text)) await once(stream, "drain");
	};

	const discard = async (): Promise<void> => {
		if (finalized) return;

		finalized = true;
		stream.destroy();
		if (useAtomicWrite)
			try {
				await unlink(tempPath);
			} catch {
				// Temp file may already be removed.
			}
	};

	return {
		write,
		writeLine: (text: string) => write(`${text}\n`),
		getStats: () => ({ sizeBytes: bytesWritten, tokenCount: totalTokenCount }),
		wouldExceed: (text: string) =>
			maxSizeBytes > 0 && bytesWritten + Buffer.byteLength(text) > maxSizeBytes,
		close: () =>
			new Promise((resolve, reject) => {
				if (finalized) {
					reject(new Error("Output writer already finalized."));

					return;
				}

				stream.end(async (error?: Error | null) => {
					if (error) {
						await discard();
						reject(error);

						return;
					}

					try {
						if (useAtomicWrite) await rename(tempPath, output);
						finalized = true;
						resolve({ sizeBytes: bytesWritten, tokenCount: totalTokenCount });
					} catch (renameError) {
						await discard();
						reject(
							renameError instanceof Error
								? renameError
								: new Error(String(renameError)),
						);
					}
				});
			}),
		discard,
	};
}
