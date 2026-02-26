import type { LogLevel, OutputFormat } from "../core/index.js";


export type RawConfigFile = Partial<{
	$schema: string;
	output: string;
	outputFile: string; // TODO(major): remove outputFile fallback
	overwrite: boolean;
	excludePatterns: string[];
	includePatterns: string[];
	includeHidden: boolean;
	gitignore: boolean;
	useGitignore: boolean; // deprecated
	maxFileSize: number | string;
	maximumFileSizeBytes: number | string; // deprecated
	maxTotalSize: number | string;
	maximumTotalSizeBytes: number | string; // deprecated
	includeTree: boolean;
	includeContents: boolean;
	format: OutputFormat;
	followSymlinks: boolean;
	ansi: boolean;
	useAnsi: boolean; // deprecated
	logLevel: LogLevel;
	date: string;
	generatedDate: string; // deprecated
	banner: string;
	bannerFile: string;
	footer: string;
	footerFile: string;
}>;

export type FlnConfig = {
	input: string;
	output: string;
	overwrite: boolean;
	excludePatterns: string[];
	includePatterns: string[];
	excludedPaths: string[];
	includeHidden: boolean;
	gitignore: boolean;
	maxFileSize: number;
	maxTotalSize: number;
	includeTree: boolean;
	includeContents: boolean;
	format: OutputFormat;
	followSymlinks: boolean;
	ansi: boolean;
	logLevel: LogLevel;
	date?: string;
	banner?: string;
	bannerFile?: string;
	footer?: string;
	footerFile?: string;
};
