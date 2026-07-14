import {
	parseWhyOutputFormat,
	type ResolvedWhyContext,
	resolveWhyFromOptions,
	type WhyOutputFormat,
} from "../api/whyConfig.js";
import type { LogLevel } from "../core/index.js";
import { flnError } from "../infra/index.js";
import type { ParsedCliFlags } from "./flagsManifest.js";
import { mapCliNegationToFlnOptions, resolveCliAnsi } from "./mapCliFlags.js";

export type WhyCliValues = Pick<
	ParsedCliFlags,
	| "debug"
	| "exclude"
	| "format"
	| "ignoreConfig"
	| "include"
	| "includeHidden"
	| "maxFileSize"
	| "noAnsi"
	| "noGitignore"
	| "only"
	| "quiet"
	| "verbose"
>;

function parseWhyPositionals(positionals: string[]): {
	pathArg?: string;
	inputArg?: string;
} {
	const pathArg = positionals.find((candidate) => candidate !== "why");
	const inputArg = positionals.find((candidate) => {
		if (candidate === "why" || candidate === pathArg) return false;

		return true;
	});

	return { pathArg, inputArg };
}

function resolveLogLevel(values: {
	quiet?: boolean;
	verbose?: boolean;
	debug?: boolean;
}): LogLevel {
	if (values.quiet) return "silent";
	if (values.debug) return "debug";
	if (values.verbose) return "verbose";

	return "normal";
}

export async function resolveWhyFromCli(
	positionals: string[],
	values: WhyCliValues,
): Promise<ResolvedWhyContext & { format: WhyOutputFormat }> {
	const { pathArg, inputArg } = parseWhyPositionals(positionals);
	if (!pathArg)
		throw flnError("INVALID_CONFIG", "Missing path argument.", {
			hint: "Usage: fln why <path> [directory] [--format text|json] ...",
		});

	const format = parseWhyOutputFormat(values.format);
	const negation = mapCliNegationToFlnOptions(values);
	const context = await resolveWhyFromOptions({
		path: pathArg,
		input: inputArg,
		exclude: values.exclude,
		include: values.include,
		only: values.only,
		includeHidden: values.includeHidden,
		gitignore: negation.gitignore,
		maxFileSize: values.maxFileSize,
		ignoreConfig: values.ignoreConfig,
		logLevel: resolveLogLevel(values),
		ansi: resolveCliAnsi(values, true),
	});

	return { ...context, format };
}
