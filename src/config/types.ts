import type { LogLevel, OutputFormat } from "../core/index.js";


export type RawConfigFile = Partial<{
	outputFile: string;
	overwrite: boolean;
	excludePatterns: string[];
	includePatterns: string[];
	includeHidden: boolean;
	useGitignore: boolean;
	maximumFileSizeBytes: number | string;
	maximumTotalSizeBytes: number | string;
	includeTree: boolean;
	includeContents: boolean;
	format: OutputFormat;
	followSymlinks: boolean;
	useAnsi: boolean;
	logLevel: LogLevel;
	generatedDate: string;
	banner: string;
	footer: string;
}>;

export type FlnConfig = {
	rootDirectory: string;
	outputFile: string;
	overwrite: boolean;
	excludePatterns: string[];
	includePatterns: string[];
	excludedPaths: string[];
	includeHidden: boolean;
	useGitignore: boolean;
	maximumFileSizeBytes: number;
	maximumTotalSizeBytes: number;
	includeTree: boolean;
	includeContents: boolean;
	format: OutputFormat;
	followSymlinks: boolean;
	useAnsi: boolean;
	logLevel: LogLevel;
	generatedDate?: string;
	banner?: string;
	footer?: string;
};
