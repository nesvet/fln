import {
	type AnnotateTreeMode,
	type FollowSymlinksMode,
	type OutputFormat,
	parseByteSize,
	type SecurityCheckMode,
	type TextEncodingMode,
	type TokenModel,
} from "../core/index.js";
import { flnError, parseDate } from "../infra/index.js";
import { defaultMaxFileSize } from "./defaults.js";
import type { FlnConfig, RawConfigFile } from "./types.js";

type ConfigOverrides = Partial<Omit<FlnConfig, "excludedPaths" | "input">> &
	Partial<{ format: string }>;

function parseOptionalSize(
	value: number | string | undefined,
): number | undefined {
	if (value === undefined) return undefined;

	return typeof value === "number" ? value : parseByteSize(value);
}

function resolveFormat(value: unknown): OutputFormat {
	if (value === undefined) return "md";
	if (value === "json" || value === "md") return value;
	throw flnError(
		"INVALID_CONFIG",
		`Invalid format: ${String(value)}. Use md or json.`,
	);
}

function getDefaultOutputFile(format: OutputFormat): string {
	return format === "json" ? "output.json" : "output.md";
}

const tokenModels = new Set<TokenModel>([
	"claude",
	"estimate",
	"gemini",
	"gpt-4",
	"gpt-4o",
	"gpt-5",
]);

export function resolveTokenModel(value: unknown): TokenModel {
	if (value === undefined) return "estimate";
	if (typeof value === "string" && tokenModels.has(value as TokenModel))
		return value as TokenModel;
	if (typeof value === "string")
		throw flnError("INVALID_CONFIG", `Invalid tokenModel: ${value}`);

	return "estimate";
}

function parseOptionalTokenCount(
	value: number | string | undefined,
): number | undefined {
	if (value === undefined) return undefined;

	if (typeof value === "number") return value;

	const parsed = Number.parseInt(value.trim(), 10);
	if (Number.isNaN(parsed) || parsed < 0)
		throw flnError("INVALID_CONFIG", `Invalid maxTokens: "${value}"`, {
			hint: "Use a non-negative integer (e.g. 200000).",
		});

	return parsed;
}

function resolveFollowSymlinks(value: unknown): FollowSymlinksMode {
	if (value === "in-root-only") return "in-root-only";

	return Boolean(value);
}

function resolveEncoding(value: unknown): TextEncodingMode {
	if (value === "utf8" || value === "latin1" || value === "auto") return value;

	return "auto";
}

export function resolveSecurityCheck(value: unknown): SecurityCheckMode {
	if (value === "strict") return "strict";

	return "default";
}

const annotateTreeModes = new Set<AnnotateTreeMode>([
	"lines",
	"size",
	"tokens",
]);

export function resolveAnnotateTree(
	value: unknown,
): AnnotateTreeMode | undefined {
	if (value === undefined) return undefined;
	if (
		typeof value === "string" &&
		annotateTreeModes.has(value as AnnotateTreeMode)
	)
		return value as AnnotateTreeMode;
	if (typeof value === "string")
		throw flnError("INVALID_CONFIG", `Invalid annotateTree: ${value}`);

	return undefined;
}

export function normalizeConfigFile(
	fileConfig: RawConfigFile,
): ConfigOverrides {
	return {
		output: fileConfig.output,
		overwrite: fileConfig.overwrite,
		exclude: fileConfig.exclude,
		include: fileConfig.include,
		only: fileConfig.only,
		onlyMode: fileConfig.onlyMode,
		relevant: fileConfig.relevant,
		includeHidden: fileConfig.includeHidden,
		gitignore: fileConfig.gitignore,
		maxFileSize: parseOptionalSize(fileConfig.maxFileSize),
		maxTotalSize: parseOptionalSize(fileConfig.maxTotalSize),
		maxTokens: parseOptionalTokenCount(fileConfig.maxTokens),
		maxContentTokens: parseOptionalTokenCount(fileConfig.maxContentTokens),
		tokenModel: resolveTokenModel(fileConfig.tokenModel),
		tree: fileConfig.tree,
		contents: fileConfig.contents,
		format: fileConfig.format,
		followSymlinks:
			fileConfig.followSymlinks === undefined
				? undefined
				: resolveFollowSymlinks(fileConfig.followSymlinks),
		ansi: fileConfig.ansi,
		logLevel: fileConfig.logLevel,
		date: fileConfig.date,
		banner: fileConfig.banner,
		bannerFile: fileConfig.bannerFile,
		footer: fileConfig.footer,
		footerFile: fileConfig.footerFile,
		strictLimits: fileConfig.strictLimits,
		compress: fileConfig.compress,
		outline: fileConfig.outline,
		diffHunks: fileConfig.diffHunks,
		since: fileConfig.since,
		encoding:
			fileConfig.encoding === undefined
				? undefined
				: resolveEncoding(fileConfig.encoding),
		securityPatterns: fileConfig.securityPatterns,
		securityCheck:
			fileConfig.securityCheck === undefined
				? undefined
				: resolveSecurityCheck(fileConfig.securityCheck),
		outputSplit: fileConfig.outputSplit,
		strictToctou: fileConfig.strictToctou,
		annotateTree:
			fileConfig.annotateTree === undefined
				? undefined
				: resolveAnnotateTree(fileConfig.annotateTree),
		collectTodo: fileConfig.collectTodo,
	};
}

export function resolveConfig(
	input: string,
	fileConfig: ConfigOverrides,
	userConfig: ConfigOverrides,
): FlnConfig {
	const format = resolveFormat(userConfig.format ?? fileConfig.format);
	const output =
		userConfig.output ?? fileConfig.output ?? getDefaultOutputFile(format);
	const rawDate = userConfig.date ?? fileConfig.date;
	const date = rawDate === undefined ? undefined : parseDate(rawDate);

	return {
		input,
		output,
		overwrite: userConfig.overwrite ?? fileConfig.overwrite ?? false,
		exclude: [...(fileConfig.exclude ?? []), ...(userConfig.exclude ?? [])],
		include: [...(fileConfig.include ?? []), ...(userConfig.include ?? [])],
		only: [...(fileConfig.only ?? []), ...(userConfig.only ?? [])],
		onlyMode: userConfig.onlyMode ?? fileConfig.onlyMode,
		relevant: [...(fileConfig.relevant ?? []), ...(userConfig.relevant ?? [])],
		excludedPaths: [],
		includeHidden:
			userConfig.includeHidden ?? fileConfig.includeHidden ?? false,
		gitignore: userConfig.gitignore ?? fileConfig.gitignore ?? true,
		maxFileSize:
			userConfig.maxFileSize ?? fileConfig.maxFileSize ?? defaultMaxFileSize,
		maxTotalSize: userConfig.maxTotalSize ?? fileConfig.maxTotalSize ?? 0,
		maxTokens: userConfig.maxTokens ?? fileConfig.maxTokens ?? 0,
		maxContentTokens:
			userConfig.maxContentTokens ?? fileConfig.maxContentTokens ?? 0,
		tokenModel: resolveTokenModel(
			userConfig.tokenModel ?? fileConfig.tokenModel,
		),
		contents: userConfig.contents ?? fileConfig.contents ?? true,
		tree: userConfig.tree ?? fileConfig.tree ?? true,
		format,
		followSymlinks:
			userConfig.followSymlinks ?? fileConfig.followSymlinks ?? false,
		ansi: userConfig.ansi ?? fileConfig.ansi ?? true,
		logLevel: userConfig.logLevel ?? fileConfig.logLevel ?? "normal",
		dryRun: userConfig.dryRun ?? fileConfig.dryRun ?? false,
		strictLimits: userConfig.strictLimits ?? fileConfig.strictLimits ?? false,
		compress: userConfig.compress ?? fileConfig.compress ?? false,
		outline: userConfig.outline ?? fileConfig.outline ?? false,
		diffHunks: userConfig.diffHunks ?? fileConfig.diffHunks ?? false,
		since: userConfig.since ?? fileConfig.since,
		encoding: userConfig.encoding ?? fileConfig.encoding ?? "auto",
		securityPatterns: [
			...(fileConfig.securityPatterns ?? []),
			...(userConfig.securityPatterns ?? []),
		],
		securityCheck: resolveSecurityCheck(
			userConfig.securityCheck ?? fileConfig.securityCheck,
		),
		outputSplit: userConfig.outputSplit ?? fileConfig.outputSplit ?? 1,
		strictToctou: userConfig.strictToctou ?? fileConfig.strictToctou ?? false,
		annotateTree: resolveAnnotateTree(
			userConfig.annotateTree ?? fileConfig.annotateTree,
		),
		collectTodo: userConfig.collectTodo ?? fileConfig.collectTodo ?? false,
		date,
		banner: userConfig.banner ?? fileConfig.banner,
		bannerFile: userConfig.bannerFile ?? fileConfig.bannerFile,
		footer: userConfig.footer ?? fileConfig.footer,
		footerFile: userConfig.footerFile ?? fileConfig.footerFile,
		copy: userConfig.copy ?? fileConfig.copy ?? false,
	};
}
