import { writeOutput } from "../core/index.js";
import { flnError } from "../infra/flnError.js";
import { diff } from "./diff.js";
import { doctor } from "./doctor.js";
import { explain } from "./explain.js";
import { mcp } from "./mcp.js";
import {
	finalizeClipboardOutput,
	runFlnPipeline,
	toFlnResult,
	toInspectResult,
} from "./pipeline.js";
import { plan } from "./plan.js";
import type { FlnInspectResult, FlnOptions, FlnResult } from "./types.js";

async function flnMain(options: FlnOptions = {}): Promise<FlnResult> {
	const pipeline = await runFlnPipeline(options);
	if (!pipeline.config.dryRun) {
		await writeOutput(pipeline.scan, pipeline.config, pipeline.logger);
		await finalizeClipboardOutput(pipeline);
	}

	return toFlnResult(pipeline.scan, pipeline.outputPath);
}

async function inspectMain(
	options: FlnOptions = {},
): Promise<FlnInspectResult> {
	if (options.copy)
		throw flnError(
			"INVALID_CONFIG",
			"copy is not supported with fln.inspect().",
			{
				hint: "Use fln({ ...options, copy: true }) to flatten and copy to the clipboard.",
			},
		);

	const { scan } = await runFlnPipeline(options);

	return toInspectResult(scan);
}

/**
 * Flatten your codebase into a single AI-ready file
 */
export const fln = Object.assign(flnMain, {
	inspect: inspectMain,
	explain,
	doctor,
	mcp,
	plan,
	diff,
});
