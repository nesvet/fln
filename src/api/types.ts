export type LogLevel = "debug" | "normal" | "silent" | "verbose";

export type ProgressCallback = (current: number, total: number) => void;

/**
 * Configuration options for fln function
 */
export type FlnOptions = {
	/**
	 * Directory to flatten (input)
	 * @default process.cwd()
	 */
	input?: string;
	
	/**
	 * Output file path or directory
	 * @default Auto-generated from project metadata (e.g., "my-app-1.0.0.md")
	 */
	output?: string;
	
	/**
	 * @deprecated Use input. Remove in next major.
	 */
	rootDirectory?: string;
	
	/**
	 * @deprecated Use output. Remove in next major.
	 */
	outputFile?: string;
	
	/**
	 * Overwrite output file instead of adding numeric suffix when it already exists
	 * @default false
	 */
	overwrite?: boolean;
	
	/**
	 * Glob patterns to exclude (e.g., ["*.test.ts", "fixtures/"])
	 * @default []
	 */
	excludePatterns?: string[];
	
	/**
	 * Glob patterns to force include, ignoring .gitignore rules
	 * @default []
	 */
	includePatterns?: string[];
	
	/**
	 * Include hidden files and directories (starting with .)
	 * @default false
	 */
	includeHidden?: boolean;
	
	/**
	 * Use .gitignore rules for filtering
	 * @default true
	 */
	gitignore?: boolean;
	
	/**
	 * @deprecated Use gitignore. Remove in next major.
	 */
	useGitignore?: boolean;
	
	/**
	 * Maximum individual file size (bytes or string like "10mb")
	 * @default 10485760 (10 MB)
	 */
	maxFileSize?: number | string;
	
	/**
	 * @deprecated Use maxFileSize. Remove in next major.
	 */
	maximumFileSizeBytes?: number | string;
	
	/**
	 * Maximum total size for all included files (bytes or string like "100mb")
	 * @default 0 (unlimited)
	 */
	maxTotalSize?: number | string;
	
	/**
	 * @deprecated Use maxTotalSize. Remove in next major.
	 */
	maximumTotalSizeBytes?: number | string;
	
	/**
	 * Include file contents in output
	 * @default true
	 */
	includeContents?: boolean;
	
	/**
	 * Include directory tree structure
	 * @default true
	 */
	includeTree?: boolean;
	
	/**
	 * Output format
	 * @default "md"
	 */
	format?: "json" | "md";
	
	/**
	 * Follow symlinks while scanning
	 * @default false
	 */
	followSymlinks?: boolean;
	
	/**
	 * Date string for the "Generated" header (format: YYYY-MM-DD HH:mm). If omitted, current date is used.
	 */
	date?: string;
	
	/**
	 * @deprecated Use date. Remove in next major.
	 */
	generatedDate?: string;
	
	/**
	 * Custom banner text at the beginning of output
	 */
	banner?: string;
	
	/**
	 * Path to file whose contents are prepended to output (relative to input). File is excluded from tree.
	 */
	bannerFile?: string;
	
	/**
	 * Custom footer text at the end of output
	 */
	footer?: string;
	
	/**
	 * Path to file whose contents are appended to output (relative to input). File is excluded from tree.
	 */
	footerFile?: string;
	
	/**
	 * Progress callback function
	 * @param current Current number of processed items
	 * @param total Estimated total number of items
	 */
	onProgress?: ProgressCallback;
	
	/**
	 * Logging level
	 * @default "silent"
	 */
	logLevel?: LogLevel;
	
	/**
	 * Use ANSI colors in log output
	 * @default false (for programmatic use)
	 */
	ansi?: boolean;
	
	/**
	 * @deprecated Use ansi. Remove in next major.
	 */
	useAnsi?: boolean;
};

/**
 * Result returned by fln function
 */
export type FlnResult = {
	/**
	 * Project name detected from package.json or directory name
	 */
	projectName: string;
	
	/**
	 * Number of files processed
	 */
	files: number;
	
	/**
	 * Number of directories scanned
	 */
	directories: number;
	
	/**
	 * Number of binary files detected
	 */
	binary: number;
	
	/**
	 * Number of files skipped (too large, generated, errors)
	 */
	skipped: number;
	
	/**
	 * Number of errors encountered
	 */
	errors: number;
	
	/**
	 * Total input size in bytes
	 */
	totalSizeBytes: number;
	
	/**
	 * Output file size in bytes
	 */
	outputSizeBytes: number;
	
	/**
	 * Estimated token count for output
	 */
	outputTokenCount: number;
	
	/**
	 * Absolute path to the generated output file
	 */
	outputPath: string;
	
	/**
	 * @internal
	 * Root file node for advanced usage (collecting stats, etc.)
	 */
	_root?: unknown;
};
