import type {
	AnnotateTreeMode,
	FollowSymlinksMode,
	LogLevel,
	ProgressCallback,
	TextEncodingMode,
} from "../core/index.js";
import type { SecurityCheckMode } from "../core/securityMatcher.js";
import type { FileNode, ScanStats } from "../core/types.js";
import type { TokenModel } from "../infra/tokenBudget.js";

export type { LogLevel, ProgressCallback } from "../core/index.js";

/**
 * Configuration options for fln function
 */
export type FlnOptions = {
	/** Directory to flatten */
	input?: string;
	/** Output file path or directory */
	output?: string;
	overwrite?: boolean;
	exclude?: string[];
	include?: string[];
	/** Whitelist: only matching files (use with --since/--ext or alone) */
	only?: string[];
	/** Restrict scan to only (default: true when only is non-empty) */
	onlyMode?: boolean;
	/** Relevant mode: only include files transitively imported by seeds */
	relevant?: string[];
	/** File paths piped via stdin (CLI: --stdin). Force-included (bypasses gitignore/exclude), then tree pruned to exactly these. Security patterns still apply. */
	stdinPaths?: string[];
	includeHidden?: boolean;
	gitignore?: boolean;
	maxFileSize?: number | string;
	maxTotalSize?: number | string;
	/** Maximum estimated tokens in output (0 = unlimited) */
	maxTokens?: number;
	/** Token budget for source file sections only (0 = use maxTokens for entire output) */
	maxContentTokens?: number;
	tokenModel?: TokenModel;
	contents?: boolean;
	tree?: boolean;
	format?: "json" | "md";
	followSymlinks?: FollowSymlinksMode;
	date?: string;
	banner?: string;
	bannerFile?: string;
	footer?: string;
	footerFile?: string;
	/** Scan and stats only — no output file, no content reads for cache */
	dryRun?: boolean;
	/** Throw when limits exceeded instead of graceful omit */
	strictLimits?: boolean;
	/** Throw when a file changed between scan and render (TOCTOU) instead of warning */
	strictToctou?: boolean;
	compress?: boolean;
	/** Outline mode: signatures only, no implementations (implies contents) */
	outline?: boolean;
	/** With since — embed unified diff hunks instead of full files */
	diffHunks?: boolean;
	since?: string;
	encoding?: TextEncodingMode;
	securityPatterns?: string[];
	securityCheck?: SecurityCheckMode;
	/** Max output parts when split by limits (default 1) */
	outputSplit?: number;
	onProgress?: ProgressCallback;
	logLevel?: LogLevel;
	ansi?: boolean;
	/** Write output to a temp file, then copy to the system clipboard (CLI: --copy) */
	copy?: boolean;
	/** Skip reading `fln.json`; use defaults and explicit options only (CLI: --ignore-config) */
	ignoreConfig?: boolean;
	/** Annotate directory tree with size (metadata), tokens, or line counts (CLI: --annotate-tree) */
	annotateTree?: AnnotateTreeMode;
	/** Collect TODO/FIXME markers into a separate section (render-phase; CLI: --collect-todo) */
	collectTodo?: boolean;
};

export type FlnInspectResult = {
	projectName: string;
	root: FileNode;
	stats: ScanStats;
};

export type FlnDoctorOptions = Omit<
	FlnOptions,
	| "annotateTree"
	| "banner"
	| "bannerFile"
	| "collectTodo"
	| "compress"
	| "copy"
	| "date"
	| "diffHunks"
	| "dryRun"
	| "footer"
	| "footerFile"
	| "format"
	| "maxContentTokens"
	| "maxTotalSize"
	| "output"
	| "outputSplit"
	| "overwrite"
	| "since"
	| "strictLimits"
	| "strictToctou"
	| "tree"
> & {
	/** Adds TOKENS_OVER_BUDGET warning when token estimate exceeds this (defaults to `maxTokens` if set) */
	maxTokensWarn?: number;
	/** Suggest exclude patterns to fit within this token budget */
	recommendBudget?: number;
};

export type FlnResult = {
	projectName: string;
	filesScanned: number;
	filesIncluded: number;
	directories: number;
	binary: number;
	skipped: number;
	errors: number;
	totalSizeBytes: number;
	outputSizeBytes: number;
	outputTokenCount: number;
	outputPath: string;
};

export type { FileNode, ScanStats, SkipReason } from "../core/types.js";
