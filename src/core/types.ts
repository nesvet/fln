import type { TokenModel } from "../infra/tokenBudget.js";
import type { SecurityCheckMode } from "./securityMatcher.js";

export type OutputFormat = "json" | "md";

export type SkipReason =
	| "generated"
	| "readError"
	| "security"
	| "symlinkCycle"
	| "symlinkEscape"
	| "tokenLimit"
	| "tooLarge"
	| "totalSizeLimit";

export type FollowSymlinksMode = "in-root-only" | boolean;

export type TextEncodingMode = "auto" | "latin1" | "utf8";

export type FileType = "directory" | "file" | "symlink";

export type LogLevel = "debug" | "normal" | "silent" | "verbose";

export type AnnotateTreeMode = "lines" | "size" | "tokens";

export type TreeAnnotation = {
	tokens?: number;
	lines?: number;
	size?: number;
};

export type FileNode = {
	name: string;
	path: string;
	type: FileType;
	size: number;
	children?: FileNode[];
	target?: string;
	isBinary?: boolean;
	skipReason?: SkipReason;
	securityDetail?: string;
	maxBacktickRun?: number;
	scanMtimeMs?: number;
	scanSize?: number;
	treeAnnotation?: TreeAnnotation;
};

export type OmittedFile = {
	path: string;
	reason: SkipReason;
	size: number;
};

export type ScanStats = {
	filesScanned: number;
	filesIncluded: number;
	directories: number;
	binary: number;
	skipped: number;
	errors: number;
	totalSizeBytes: number;
	outputSizeBytes: number;
	outputTokenCount: number;
	omittedByReason?: Partial<Record<SkipReason, number>>;
};

export type ScanResult = {
	projectName: string;
	root: FileNode;
	stats: ScanStats;
};

export type ProgressCallback = (current: number, total: number) => void;

export type ScanOptions = {
	projectName: string;
	input: string;
	exclude: string[];
	include: string[];
	excludedPaths: string[];
	includeHidden: boolean;
	gitignore: boolean;
	maxFileSize: number;
	maxTotalSize: number;
	tokenModel: TokenModel;
	contents: boolean;
	only: string[];
	onlyMode: boolean;
	followSymlinks: FollowSymlinksMode;
	dryRun: boolean;
	encoding: TextEncodingMode;
	securityCheck?: SecurityCheckMode;
	securityPatterns: string[];
	onProgress?: ProgressCallback;
};

export type RenderOptions = {
	output: string;
	format: OutputFormat;
	tree: boolean;
	contents: boolean;
	outline: boolean;
	ansi: boolean;
	banner?: string;
	footer?: string;
};

export type { TokenModel } from "../infra/tokenBudget.js";
