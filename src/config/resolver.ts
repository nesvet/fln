import { parseByteSize, type OutputFormat } from "../core/index.js";
import { parseGeneratedDate, resolveOption } from "../infra/index.js";
import { defaultMaxFileSize } from "./defaults.js";
import type { FlnConfig, RawConfigFile } from "./types.js";


type ConfigOverrides = Partial<Pick<
	FlnConfig,
	"ansi" |
	"banner" |
	"date" |
	"excludePatterns" |
	"followSymlinks" |
	"footer" |
	"gitignore" |
	"includeContents" |
	"includeHidden" |
	"includePatterns" |
	"includeTree" |
	"logLevel" |
	"maxFileSize" |
	"maxTotalSize" |
	"output" |
	"overwrite"
>> & Partial<{ bannerFile: string; format: string; footerFile: string; outputFile: string }>; // outputFile: TODO(major): remove

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
	// TODO(major): remove outputFile fallback
	const output = fileConfig.output ?? fileConfig.outputFile;
	
	const gitignore = resolveOption<boolean>(fileConfig, "gitignore", "useGitignore", "config file");
	const maxFileSize = resolveOption(fileConfig, "maxFileSize", "maximumFileSizeBytes", "config file", v =>
		parseOptionalSize(v as number | string | undefined)
	);
	const maxTotalSize = resolveOption(fileConfig, "maxTotalSize", "maximumTotalSizeBytes", "config file", v =>
		parseOptionalSize(v as number | string | undefined)
	);
	const ansi = resolveOption<boolean>(fileConfig, "ansi", "useAnsi", "config file");
	const date = resolveOption<string>(fileConfig, "date", "generatedDate", "config file");
	
	return {
		output,
		overwrite: fileConfig.overwrite,
		excludePatterns: fileConfig.excludePatterns,
		includePatterns: fileConfig.includePatterns,
		includeHidden: fileConfig.includeHidden,
		gitignore,
		maxFileSize,
		maxTotalSize,
		includeTree: fileConfig.includeTree,
		includeContents: fileConfig.includeContents,
		format: fileConfig.format,
		followSymlinks: fileConfig.followSymlinks,
		ansi,
		logLevel: fileConfig.logLevel,
		date,
		banner: fileConfig.banner,
		bannerFile: fileConfig.bannerFile,
		footer: fileConfig.footer,
		footerFile: fileConfig.footerFile
	};
}

export function resolveConfig(
	input: string,
	fileConfig: ConfigOverrides,
	userConfig: ConfigOverrides
): FlnConfig {
	const format = resolveFormat(userConfig.format ?? fileConfig.format);
	// TODO(major): remove outputFile fallback
	const output = userConfig.output ?? userConfig.outputFile ?? fileConfig.output ?? fileConfig.outputFile ?? getDefaultOutputFile(format);
	const rawDate = userConfig.date ?? fileConfig.date;
	const date = rawDate === undefined ? undefined : parseGeneratedDate(rawDate);
	
	return {
		input,
		output,
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
		gitignore: userConfig.gitignore ?? fileConfig.gitignore ?? true,
		maxFileSize: userConfig.maxFileSize ?? fileConfig.maxFileSize ?? defaultMaxFileSize,
		maxTotalSize: userConfig.maxTotalSize ?? fileConfig.maxTotalSize ?? 0,
		includeContents: userConfig.includeContents ?? fileConfig.includeContents ?? true,
		includeTree: userConfig.includeTree ?? fileConfig.includeTree ?? true,
		format,
		followSymlinks: userConfig.followSymlinks ?? fileConfig.followSymlinks ?? false,
		ansi: userConfig.ansi ?? fileConfig.ansi ?? true,
		logLevel: userConfig.logLevel ?? fileConfig.logLevel ?? "normal",
		date,
		banner: userConfig.banner ?? fileConfig.banner,
		bannerFile: userConfig.bannerFile ?? fileConfig.bannerFile,
		footer: userConfig.footer ?? fileConfig.footer,
		footerFile: userConfig.footerFile ?? fileConfig.footerFile
	};
}
