export type OutputFormat = "json" | "md";

export type SkipReason = "generated" | "readError" | "symlinkCycle" | "tooLarge" | "totalSizeLimit";

export type FileType = "directory" | "file" | "symlink";

export type LogLevel = "debug" | "normal" | "silent" | "verbose";

export type FileNode = {
	name: string;
	path: string;
	type: FileType;
	size: number;
	children?: FileNode[];
	target?: string;
	isBinary?: boolean;
	skipReason?: SkipReason;
};

export type ScanStats = {
	files: number;
	directories: number;
	binary: number;
	skipped: number;
	errors: number;
	totalSizeBytes: number;
	outputSizeBytes: number;
	outputTokenCount: number;
};

export type ScanResult = {
	projectName: string;
	root: FileNode;
	stats: ScanStats;
};

export type ProgressCallback = (current: number, total: number) => void;

export type ScanOptions = {
	projectName: string;
	rootDirectory: string;
	excludePatterns: string[];
	includePatterns: string[];
	excludedPaths: string[];
	includeHidden: boolean;
	useGitignore: boolean;
	maximumFileSizeBytes: number;
	maximumTotalSizeBytes: number;
	followSymlinks: boolean;
	onProgress?: ProgressCallback;
};

export type RenderOptions = {
	outputFile: string;
	format: OutputFormat;
	includeTree: boolean;
	includeContents: boolean;
	useAnsi: boolean;
	banner?: string;
	footer?: string;
};

