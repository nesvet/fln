import type { LogLevel, ProgressCallback } from "$core";


/**
 * Configuration options for fln function
 */
export type FlnOptions = {
	/**
	 * Root directory to scan
	 * @default process.cwd()
	 */
	rootDirectory?: string;
	
	/**
	 * Output file path or directory
	 * @default Auto-generated from project metadata (e.g., "my-app-1.0.0.md")
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
	useGitignore?: boolean;
	
	/**
	 * Maximum individual file size (bytes or string like "10mb")
	 * @default 10485760 (10 MB)
	 */
	maximumFileSizeBytes?: number | string;
	
	/**
	 * Maximum total size for all included files (bytes or string like "100mb")
	 * @default 0 (unlimited)
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
	generatedDate?: string;
	
	/**
	 * Custom banner text at the beginning of output
	 */
	banner?: string;
	
	/**
	 * Custom footer text at the end of output
	 */
	footer?: string;
	
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
