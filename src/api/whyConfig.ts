import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveConfig, resolveFileConfigAtInput } from "../config/index.js";
import { type LogLevel, parseByteSize } from "../core/index.js";
import type { ExplainPathOptions } from "../core/pathDecision.js";
import { createLogger, flnError, type Logger } from "../infra/index.js";
import { toCanonicalRelative } from "../path/index.js";

export type FlnExplainOptions = {
	path: string;
	input?: string;
	exclude?: string[];
	include?: string[];
	only?: string[];
	onlyMode?: boolean;
	includeHidden?: boolean;
	gitignore?: boolean;
	maxFileSize?: number | string;
	securityPatterns?: string[];
	securityCheck?: import("../core/securityMatcher.js").SecurityCheckMode;
	logLevel?: LogLevel;
	ansi?: boolean;
	ignoreConfig?: boolean;
};

export type ResolvedWhyContext = {
	input: string;
	relativePath: string;
	explainPathOptions: ExplainPathOptions;
	logger: Logger;
	logLevel: LogLevel;
	ansi: boolean;
};

export type WhyOutputFormat = "json" | "text";

export function parseWhyOutputFormat(
	format: string | undefined,
): WhyOutputFormat {
	if (format === undefined || format === "text") return "text";
	if (format === "json") return "json";

	throw flnError(
		"INVALID_CONFIG",
		`Invalid --format for fln why: ${format}. Use text or json.`,
	);
}

export async function resolveWhyFromOptions(
	options: FlnExplainOptions,
): Promise<ResolvedWhyContext> {
	if (!options.path?.trim())
		throw flnError("INVALID_CONFIG", "explain() requires a non-empty path.");

	const cwd = process.cwd();
	const input = resolve(cwd, options.input ?? ".");
	const inputStats = await stat(input);
	if (!inputStats.isDirectory())
		throw flnError(
			"INPUT_NOT_DIRECTORY",
			`Input must be a directory: ${input}`,
			{ path: input },
		);

	const { fileConfig } = await resolveFileConfigAtInput(input, {
		ignoreConfig: options.ignoreConfig,
	});

	const maxFileSize =
		options.maxFileSize === undefined
			? undefined
			: typeof options.maxFileSize === "number"
				? options.maxFileSize
				: parseByteSize(options.maxFileSize);
	const userConfig = {
		exclude: options.exclude,
		include: options.include,
		only: options.only,
		onlyMode: options.onlyMode,
		includeHidden: options.includeHidden,
		gitignore: options.gitignore,
		maxFileSize,
		securityPatterns: options.securityPatterns,
		securityCheck: options.securityCheck,
	};
	const config = resolveConfig(input, fileConfig, userConfig);
	const onlyMode = config.onlyMode ?? config.only.length > 0;
	const logLevel = options.logLevel ?? "silent";
	const ansi = options.ansi ?? false;
	const logger = createLogger({ ansi, logLevel });
	const relativePath = toCanonicalRelative(options.path, input);
	if (relativePath === null)
		throw flnError(
			"INVALID_CONFIG",
			`Path resolves outside input directory: ${options.path}`,
			{ path: options.path },
		);

	return {
		input,
		relativePath,
		logger,
		logLevel,
		ansi,
		explainPathOptions: {
			input,
			relativePath,
			exclude: config.exclude,
			include: config.include,
			only: config.only,
			onlyMode,
			includeHidden: config.includeHidden,
			gitignore: config.gitignore,
			maxFileSize: config.maxFileSize,
			securityPatterns: config.securityPatterns,
			securityCheck: config.securityCheck,
		},
	};
}
