import { parseByteSize, type OutputFormat } from "$core";
import { defaultMaximumFileSizeBytes } from "./defaults";
import type { FlatrConfig, RawConfigFile } from "./types";


type ConfigOverrides = Partial<Pick<
	FlatrConfig,
	"banner" |
	"excludePatterns" |
	"followSymlinks" |
	"footer" |
	"includeContents" |
	"includeHidden" |
	"includePatterns" |
	"includeTree" |
	"logLevel" |
	"maximumFileSizeBytes" |
	"maximumTotalSizeBytes" |
	"outputFile" |
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
		banner: fileConfig.banner,
		footer: fileConfig.footer
	};
}

export function resolveConfig(
	rootDirectory: string,
	fileConfig: ConfigOverrides,
	userConfig: ConfigOverrides
): FlatrConfig {
	const format = resolveFormat(userConfig.format ?? fileConfig.format);
	const outputFile = userConfig.outputFile ?? fileConfig.outputFile ?? getDefaultOutputFile(format);
	
	return {
		rootDirectory,
		outputFile,
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
		banner: userConfig.banner ?? fileConfig.banner,
		footer: userConfig.footer ?? fileConfig.footer
	};
}
