import { basename, join, resolve } from "node:path";
import {
	defaultConfigFileName,
	resolveFileConfigAtInput,
} from "../config/index.js";
import { checkToctou } from "../core/fileContent.js";
import {
	collectExtensionBreakdown,
	collectSkipReasonCounts,
	type ExtensionBreakdownEntry,
	type FileNode,
	type SkipReason,
	sumIncludedFileBytes,
} from "../core/index.js";
import {
	estimateTokensFromBytes,
	type GitDoctorInfo,
	getGitDoctorInfo,
	getSponsorTrackingStatus,
	type SponsorTrackingStatus,
	type TokenModel,
} from "../infra/index.js";
import {
	buildRecommendBudget,
	type FlnDoctorRecommend,
} from "./doctorRecommend.js";
import { runFlnPipeline, toInspectResult } from "./pipeline.js";
import type { FlnDoctorOptions, FlnInspectResult } from "./types.js";

export type { FlnDoctorRecommend } from "./doctorRecommend.js";

export type FlnDoctorWarningCode =
	| "FILES_CHANGED_DURING_PREFLIGHT"
	| "FILES_TOO_LARGE"
	| "SECURITY_IN_TREE"
	| "TOKENS_OVER_BUDGET";

export type FlnDoctorWarning = {
	code: FlnDoctorWarningCode;
	count?: number;
	limit?: number;
	estimate?: number;
};

export type FlnDoctorJson = {
	schemaVersion: 1;
	projectName: string;
	config: {
		loaded: boolean;
		path: string;
		ignored?: boolean;
	};
	git: GitDoctorInfo;
	scan: {
		filesIncluded: number;
		filesScanned: number;
	};
	estimate: {
		totalBytes: number;
		tokens: number;
		model: string;
	};
	extensions: ExtensionBreakdownEntry[];
	warnings: FlnDoctorWarning[];
	recommend?: FlnDoctorRecommend;
};

export type FlnDoctorJsonOutput = FlnDoctorJson & { $schema: string };

export type DoctorReport = {
	projectName: string;
	configLoaded: boolean;
	configIgnored: boolean;
	configPath: string;
	git: GitDoctorInfo;
	filesIncluded: number;
	filesScanned: number;
	totalBytes: number;
	tokens: number;
	tokenModel: TokenModel;
	extensions: ExtensionBreakdownEntry[];
	warnings: FlnDoctorWarning[];
	recommend?: FlnDoctorRecommend;
	sponsorTracking: SponsorTrackingStatus;
};

function buildWarnings(
	skipCounts: Map<SkipReason, number>,
	tokens: number,
	maxTokensWarn?: number,
	changedDuringPreflight?: number,
): FlnDoctorWarning[] {
	const warnings: FlnDoctorWarning[] = [];
	const tooLarge = skipCounts.get("tooLarge") ?? 0;
	if (tooLarge > 0) warnings.push({ code: "FILES_TOO_LARGE", count: tooLarge });

	const security = skipCounts.get("security") ?? 0;
	if (security > 0)
		warnings.push({ code: "SECURITY_IN_TREE", count: security });

	if (changedDuringPreflight && changedDuringPreflight > 0)
		warnings.push({
			code: "FILES_CHANGED_DURING_PREFLIGHT",
			count: changedDuringPreflight,
		});

	if (
		maxTokensWarn !== undefined &&
		maxTokensWarn > 0 &&
		tokens > maxTokensWarn
	)
		warnings.push({
			code: "TOKENS_OVER_BUDGET",
			limit: maxTokensWarn,
			estimate: tokens,
		});

	return warnings;
}

async function countChangedDuringPreflight(
	root: FileNode,
	input: string,
): Promise<number> {
	let changed = 0;

	async function walk(node: FileNode): Promise<void> {
		if (
			node.type === "file" &&
			node.scanMtimeMs !== undefined &&
			node.scanSize !== undefined
		) {
			const absolutePath = join(input, node.path);
			if (await checkToctou(absolutePath, node.scanMtimeMs, node.scanSize))
				changed += 1;
		}

		for (const child of node.children ?? []) await walk(child);
	}

	await walk(root);

	return changed;
}

function buildDoctorReport(input: {
	inspect: FlnInspectResult;
	configLoaded: boolean;
	configIgnored: boolean;
	configPath: string;
	git: GitDoctorInfo;
	tokenModel: TokenModel;
	maxTokensWarn?: number;
	recommendBudget?: number;
	changedDuringPreflight?: number;
	sponsorTracking: SponsorTrackingStatus;
}): DoctorReport {
	const totalBytes = sumIncludedFileBytes(input.inspect.root);
	const tokens = estimateTokensFromBytes(totalBytes, input.tokenModel);
	const skipCounts = collectSkipReasonCounts(input.inspect.root);
	const warnings = buildWarnings(
		skipCounts,
		tokens,
		input.maxTokensWarn,
		input.changedDuringPreflight,
	);
	const recommend =
		input.recommendBudget && input.recommendBudget > 0
			? buildRecommendBudget(
					input.inspect.root,
					input.recommendBudget,
					input.tokenModel,
				)
			: undefined;

	return {
		projectName: input.inspect.projectName,
		configLoaded: input.configLoaded,
		configIgnored: input.configIgnored,
		configPath: input.configPath,
		git: input.git,
		filesIncluded: input.inspect.stats.filesIncluded,
		filesScanned: input.inspect.stats.filesScanned,
		totalBytes,
		tokens,
		tokenModel: input.tokenModel,
		extensions: collectExtensionBreakdown(input.inspect.root),
		warnings,
		recommend,
		sponsorTracking: input.sponsorTracking,
	};
}

export function toFlnDoctorJson(report: DoctorReport): FlnDoctorJsonOutput {
	return {
		$schema: "https://fln.nesvet.dev/schema/doctor",
		schemaVersion: 1,
		projectName: report.projectName,
		config: {
			loaded: report.configLoaded,
			path: report.configPath,
			...(report.configIgnored ? { ignored: true } : {}),
		},
		git: report.git,
		scan: {
			filesIncluded: report.filesIncluded,
			filesScanned: report.filesScanned,
		},
		estimate: {
			totalBytes: report.totalBytes,
			tokens: report.tokens,
			model: report.tokenModel,
		},
		extensions: report.extensions,
		warnings: report.warnings,
		...(report.recommend ? { recommend: report.recommend } : {}),
	};
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTopExtensions(extensions: ExtensionBreakdownEntry[]): string {
	if (extensions.length === 0) return "—";

	const totalBytes = extensions.reduce((sum, entry) => sum + entry.bytes, 0);
	if (totalBytes === 0) return "—";

	const top = extensions.slice(0, 3);

	return top
		.map((entry) => {
			const label = entry.ext ? `.${entry.ext}` : "(no ext)";
			const percent = Math.round((entry.bytes / totalBytes) * 100);

			return `${label} ${percent}%`;
		})
		.join(", ");
}

function formatSponsorTrackingLine(tracking: SponsorTrackingStatus): string {
	if (!tracking.enabled) return "Sponsor tracking: disabled";

	return `Sponsor tracking: enabled (run #${tracking.runCount})`;
}

function formatWarning(warning: FlnDoctorWarning): string {
	switch (warning.code) {
		case "FILES_CHANGED_DURING_PREFLIGHT":
			return `${warning.count} files changed during preflight`;
		case "FILES_TOO_LARGE":
			return `${warning.count} files > maxFileSize`;
		case "SECURITY_IN_TREE":
			return `${warning.count} security path in tree`;
		case "TOKENS_OVER_BUDGET":
			return `estimated ~${warning.estimate?.toLocaleString("en-US")} tokens > --max-tokens ${warning.limit?.toLocaleString("en-US")}`;
	}
}

export function formatDoctorText(report: DoctorReport): string {
	const lines = [
		`fln doctor — ${report.projectName}`,
		"",
		`Config:     ${report.configPath}${report.configIgnored ? " (ignored)" : report.configLoaded ? " (ok)" : " (defaults)"}`,
		formatGitLine(report.git),
		`Scan:       ${report.filesIncluded.toLocaleString("en-US")} files included (${report.filesScanned.toLocaleString("en-US")} scanned)`,
		`Size:       ${formatBytes(report.totalBytes)} source (estimated)`,
		`Tokens:     ~${report.tokens.toLocaleString("en-US")} (${report.tokenModel} model; ±20% vs flatten)`,
		`Top ext:    ${formatTopExtensions(report.extensions)}`,
		formatSponsorTrackingLine(report.sponsorTracking),
	];

	if (report.warnings.length > 0) {
		const warningText = report.warnings.map(formatWarning).join(", ");
		lines.push(`Warnings:   ${warningText}`);
	}

	return lines.join("\n");
}

function formatGitLine(git: GitDoctorInfo): string {
	if (!git.available) return "Git:        not a repository";

	const branch = git.branch ?? "detached";
	const dirtySuffix = git.dirty ? ", dirty" : "";

	return `Git:        repo detected, branch ${branch}${dirtySuffix}`;
}

export async function doctor(
	options: FlnDoctorOptions = {},
): Promise<DoctorReport> {
	const input = resolve(options.input ?? process.cwd());
	const ignoreConfig = options.ignoreConfig ?? false;
	const { configPath, loaded: configLoaded } = await resolveFileConfigAtInput(
		input,
		{ ignoreConfig },
	);

	const pipeline = await runFlnPipeline(
		{
			...options,
			input,
			dryRun: true,
			contents: true,
			logLevel: options.logLevel ?? "silent",
			ansi: options.ansi ?? false,
		},
		{ allowNoFilesIncluded: true },
	);

	const inspect = toInspectResult(pipeline.scan);
	const changedDuringPreflight = await countChangedDuringPreflight(
		inspect.root,
		input,
	);
	const git = getGitDoctorInfo(input);
	const sponsorTracking = await getSponsorTrackingStatus();
	const maxTokensWarn = options.maxTokensWarn ?? options.maxTokens;

	return buildDoctorReport({
		inspect,
		configLoaded,
		configIgnored: ignoreConfig,
		configPath: basename(configPath) || defaultConfigFileName,
		git,
		tokenModel: pipeline.config.tokenModel,
		maxTokensWarn:
			maxTokensWarn && maxTokensWarn > 0 ? maxTokensWarn : undefined,
		recommendBudget: options.recommendBudget,
		changedDuringPreflight,
		sponsorTracking,
	});
}
