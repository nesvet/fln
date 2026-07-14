import type { FlnConfig } from "../../config/index.js";
import { createOutputWriter, createTokenCounter } from "../../infra/index.js";
import type { ScanResult } from "../types.js";

export type OutputWriter = Awaited<ReturnType<typeof createOutputWriter>>;

export async function createWriterForConfig(
	config: FlnConfig,
	outputPath = config.output,
) {
	const countTokensFn =
		config.maxTokens > 0 || config.maxContentTokens > 0
			? await createTokenCounter(config.tokenModel)
			: undefined;

	return createOutputWriter(outputPath, config.maxTotalSize, {
		tokenModel: config.tokenModel,
		countTokensFn,
		strictLimits: config.strictLimits,
	});
}

export async function finalizeWriter(
	writer: OutputWriter,
	result: ScanResult,
	error?: unknown,
): Promise<void> {
	if (error) {
		await writer.discard();

		const message =
			error instanceof Error ? error.message : JSON.stringify(error);

		throw error instanceof Error ? error : new Error(message);
	}

	({
		sizeBytes: result.stats.outputSizeBytes,
		tokenCount: result.stats.outputTokenCount,
	} = await writer.close());
}
