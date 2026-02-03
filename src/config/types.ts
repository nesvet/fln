import type { LogLevel, OutputFormat } from "$core";


export type RawConfigFile = Partial<{
	outputFile: string;
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
	banner: string;
	footer: string;
}>;

export type FlatrConfig = {
	rootDirectory: string;
	outputFile: string;
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
	banner?: string;
	footer?: string;
};
