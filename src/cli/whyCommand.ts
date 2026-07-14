import { formatExplainDecision, toFlnWhyJson } from "../api/explain.js";
import type { ResolvedWhyContext, WhyOutputFormat } from "../api/whyConfig.js";
import { explainPath } from "../core/pathDecision.js";
import { FlnError, flnError, toFlnFailureJson } from "../infra/index.js";
import { formatFlnCliError, resolveExitCode } from "./flnErrorOutput.js";
import { resolveWhyFromCli, type WhyCliValues } from "./whyCli.js";

function toFailureJson(error: unknown) {
	if (error instanceof FlnError) return toFlnFailureJson(error);

	const message = error instanceof Error ? error.message : String(error);

	return toFlnFailureJson(flnError("INVALID_CONFIG", message));
}

function printWhyError(error: unknown, useJsonOutput: boolean): void {
	if (useJsonOutput) console.error(JSON.stringify(toFailureJson(error)));
	else console.error(formatFlnCliError(error));
}

export async function runWhyCommand(
	positionals: string[],
	values: WhyCliValues,
): Promise<void> {
	const useJsonOutput = values.format === "json";
	let resolved: ResolvedWhyContext & { format: WhyOutputFormat };

	try {
		resolved = await resolveWhyFromCli(positionals, values);
	} catch (error) {
		printWhyError(error, useJsonOutput);
		process.exit(resolveExitCode(error));
	}

	const { explainPathOptions } = resolved;
	const decision = await explainPath(explainPathOptions, resolved.logger);

	if (resolved.format === "json")
		console.info(JSON.stringify(toFlnWhyJson(resolved.input, decision)));
	else console.info(formatExplainDecision(decision));

	process.exit(decision.included ? 0 : 1);
}
