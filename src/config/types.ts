import type {
	AnnotateTreeMode,
	FollowSymlinksMode,
	LogLevel,
	OutputFormat,
	TextEncodingMode,
} from "../core/index.js";
import type { SecurityCheckMode } from "../core/securityMatcher.js";
import type { TokenModel } from "../infra/tokenBudget.js";

export type RawConfigFile = Partial<{
	$schema: string;
	output: string;
	overwrite: boolean;
	exclude: string[];
	include: string[];
	only: string[];
	onlyMode: boolean;
	relevant: string[];
	includeHidden: boolean;
	gitignore: boolean;
	maxFileSize: number | string;
	maxTotalSize: number | string;
	maxTokens: number | string;
	maxContentTokens: number | string;
	tokenModel: string;
	tree: boolean;
	contents: boolean;
	format: OutputFormat;
	followSymlinks: "in-root-only" | boolean;
	ansi: boolean;
	logLevel: LogLevel;
	date: string;
	banner: string;
	bannerFile: string;
	footer: string;
	footerFile: string;
	strictLimits: boolean;
	compress: boolean;
	outline: boolean;
	diffHunks: boolean;
	since: string;
	encoding: TextEncodingMode;
	securityPatterns: string[];
	securityCheck: SecurityCheckMode;
	outputSplit: number;
	strictToctou: boolean;
	annotateTree?: AnnotateTreeMode;
	collectTodo: boolean;
}>;

export const configFileKeys = new Set<string>([
	"$schema",
	"output",
	"overwrite",
	"exclude",
	"include",
	"only",
	"onlyMode",
	"relevant",
	"includeHidden",
	"gitignore",
	"maxFileSize",
	"maxTotalSize",
	"maxTokens",
	"maxContentTokens",
	"tokenModel",
	"tree",
	"contents",
	"format",
	"followSymlinks",
	"ansi",
	"logLevel",
	"date",
	"banner",
	"bannerFile",
	"footer",
	"footerFile",
	"strictLimits",
	"compress",
	"outline",
	"diffHunks",
	"since",
	"encoding",
	"securityPatterns",
	"securityCheck",
	"outputSplit",
	"strictToctou",
	"annotateTree",
	"collectTodo",
]);

export type FlnConfig = {
	input: string;
	output: string;
	overwrite: boolean;
	exclude: string[];
	include: string[];
	only: string[];
	onlyMode?: boolean;
	relevant: string[];
	excludedPaths: string[];
	includeHidden: boolean;
	gitignore: boolean;
	maxFileSize: number;
	maxTotalSize: number;
	maxTokens: number;
	maxContentTokens: number;
	tokenModel: TokenModel;
	tree: boolean;
	contents: boolean;
	format: OutputFormat;
	followSymlinks: FollowSymlinksMode;
	ansi: boolean;
	logLevel: LogLevel;
	dryRun: boolean;
	strictLimits: boolean;
	compress: boolean;
	outline: boolean;
	diffHunks: boolean;
	since?: string;
	encoding: TextEncodingMode;
	securityPatterns: string[];
	securityCheck: SecurityCheckMode;
	outputSplit: number;
	strictToctou: boolean;
	annotateTree?: AnnotateTreeMode;
	collectTodo: boolean;
	date?: string;
	banner?: string;
	bannerFile?: string;
	footer?: string;
	footerFile?: string;
	copy?: boolean;
};
