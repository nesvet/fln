import { parseByteSize, type OutputFormat } from "../core/index.js";
import { parseGeneratedDate } from "../infra/index.js";
import { defaultMaximumFileSizeBytes } from "./defaults.js";
import type { FlnConfig, RawConfigFile } from "./types.js";


type ConfigOverrides = Partial<Pick<
	FlnConfig,
	"banner" |
	"excludePatterns" |
	"followSymlinks" |
	"footer" |
	"generatedDate" |
	"includeContents" |
	"includeHidden" |
	"includePatterns" |
	"includeTree" |
	"logLevel" |
	"maximumFileSizeBytes" |
	"maximumTotalSizeBytes" |
	"outputFile" |
	"overwrite" |
	"useAnsi" |
	"useGitignore"
>> & Partial<{ format: string }>;

function parseOptionalSize(value: number | string | undefined): number | undefined {
	if (value === undefined)
		return undefined;
	
	return typeof value === "number" ? value : parseByteSize(value);
}

function resolveFormat(value: unknown): OutputFormat {
	return value === "json" ? "json" : "md";
}

function getDefaultOutputFile(format: OutputFormat): string {
	return format === "json" ? "output.json" : "output.md";
}


export function normalizeConfigFile(fileConfig: RawConfigFile): ConfigOverrides {
	return {
		outputFile: fileConfig.outputFile,
		overwrite: fileConfig.overwrite,
		excludePatterns: fileConfig.excludePatterns,
		includePatterns: fileConfig.includePatterns,
		includeHidden: fileConfig.includeHidden,
		useGitignore: fileConfig.useGitignore,
		maximumFileSizeBytes: parseOptionalSize(fileConfig.maximumFileSizeBytes),
		maximumTotalSizeBytes: parseOptionalSize(fileConfig.maximumTotalSizeBytes),
		includeTree: fileConfig.includeTree,
		includeContents: fileConfig.includeContents,
		format: fileConfig.format,
		followSymlinks: fileConfig.followSymlinks,
		useAnsi: fileConfig.useAnsi,
		logLevel: fileConfig.logLevel,
		generatedDate: fileConfig.generatedDate,
		banner: fileConfig.banner,
		footer: fileConfig.footer
	};
}

export function resolveConfig(
	rootDirectory: string,
	fileConfig: ConfigOverrides,
	userConfig: ConfigOverrides
): FlnConfig {
	const format = resolveFormat(userConfig.format ?? fileConfig.format);
	const outputFile = userConfig.outputFile ?? fileConfig.outputFile ?? getDefaultOutputFile(format);
	const rawGeneratedDate = userConfig.generatedDate ?? fileConfig.generatedDate;
	const generatedDate = rawGeneratedDate === undefined ? undefined : parseGeneratedDate(rawGeneratedDate);
	
	return {
		rootDirectory,
		outputFile,
		overwrite: userConfig.overwrite ?? fileConfig.overwrite ?? false,
		excludePatterns: [
			...(fileConfig.excludePatterns ?? []),
			...(userConfig.excludePatterns ?? [])
		],
		includePatterns: [
			...(fileConfig.includePatterns ?? []),
			...(userConfig.includePatterns ?? [])
		],
		excludedPaths: [],
		includeHidden: userConfig.includeHidden ?? fileConfig.includeHidden ?? false,
		useGitignore: userConfig.useGitignore ?? fileConfig.useGitignore ?? true,
		maximumFileSizeBytes: userConfig.maximumFileSizeBytes ?? fileConfig.maximumFileSizeBytes ?? defaultMaximumFileSizeBytes,
		maximumTotalSizeBytes: userConfig.maximumTotalSizeBytes ?? fileConfig.maximumTotalSizeBytes ?? 0,
		includeContents: userConfig.includeContents ?? fileConfig.includeContents ?? true,
		includeTree: userConfig.includeTree ?? fileConfig.includeTree ?? true,
		format,
		followSymlinks: userConfig.followSymlinks ?? fileConfig.followSymlinks ?? false,
		useAnsi: userConfig.useAnsi ?? fileConfig.useAnsi ?? true,
		logLevel: userConfig.logLevel ?? fileConfig.logLevel ?? "normal",
		generatedDate,
		banner: userConfig.banner ?? fileConfig.banner,
		footer: userConfig.footer ?? fileConfig.footer
	};
}
