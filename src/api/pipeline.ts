import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
	defaultConfigFileName,
	type FlnConfig,
	getProjectMetadata,
	resolveConfig,
	resolveFileConfigAtInput,
	resolveOutputPath,
} from "../config/index.js";
import {
	parseByteSize,
	pruneTree,
	resolveRelevantFiles,
	scanTree,
} from "../core/index.js";
import type { ScanResult } from "../core/types.js";
import {
	copyFileToClipboard,
	createLogger,
	flnError,
	type Logger,
	resolveEffectiveCopyMaxBytes,
	symbols,
} from "../infra/index.js";
import { resolveFromBase, toCanonicalRelative } from "../path/index.js";
import type { FlnInspectResult, FlnOptions, FlnResult } from "./types.js";

export type FlnPipelineResult = {
	scan: ScanResult;
	config: FlnConfig;
	outputPath: string;
	logger: Logger;
	/** Temp directory when copy; removed after finalizeClipboardOutput */
	copyTempDirectory?: string;
};

let copyTempDirectoryTracker: ((path: string) => void) | undefined;

export function setCopyTempDirectoryTrackerForTests(
	tracker: ((path: string) => void) | undefined,
): void {
	copyTempDirectoryTracker = tracker;
}

export function validateCopyOptions(options: FlnOptions): void {
	if (!options.copy) return;
	if (options.dryRun)
		throw flnError("INVALID_CONFIG", "--copy cannot be used with --dry-run.", {
			hint: "Remove --dry-run or use -o to inspect scan stats only.",
		});
	if (options.output !== undefined)
		throw flnError("INVALID_CONFIG", "--copy cannot be used with --output.", {
			hint: "Use either --copy or -o/--stdout, not both.",
		});
	if (options.outputSplit !== undefined && options.outputSplit > 1)
		throw flnError(
			"INVALID_CONFIG",
			"--copy does not support --output-split greater than 1.",
			{
				hint: "Use -o for multi-part output, or --copy for a single clipboard snapshot.",
			},
		);
}

export function validateFormatOptions(
	format: "json" | "md",
	outputSplit: number,
): void {
	if (format === "json" && outputSplit > 1)
		throw flnError(
			"INVALID_CONFIG",
			"--output-split is not supported with --format json.",
			{
				hint: "Use --format md for multi-part output, or remove --output-split.",
			},
		);
}

export async function finalizeClipboardOutput(
	pipeline: FlnPipelineResult,
): Promise<void> {
	if (!pipeline.config.copy) return;

	const writtenPath = pipeline.config.output;
	const { copyTempDirectory } = pipeline;

	try {
		await copyFileToClipboard(writtenPath, {
			maxBytes: resolveEffectiveCopyMaxBytes(pipeline.config.maxTotalSize),
		});
	} finally {
		if (copyTempDirectory)
			await rm(copyTempDirectory, { recursive: true, force: true });
	}
}

export function toInspectResult(scan: ScanResult): FlnInspectResult {
	return {
		projectName: scan.projectName,
		root: scan.root,
		stats: scan.stats,
	};
}

export function toFlnResult(scan: ScanResult, outputPath: string): FlnResult {
	return {
		projectName: scan.projectName,
		filesScanned: scan.stats.filesScanned,
		filesIncluded: scan.stats.filesIncluded,
		directories: scan.stats.directories,
		binary: scan.stats.binary,
		skipped: scan.stats.skipped,
		errors: scan.stats.errors,
		totalSizeBytes: scan.stats.totalSizeBytes,
		outputSizeBytes: scan.stats.outputSizeBytes,
		outputTokenCount: scan.stats.outputTokenCount,
		outputPath,
	};
}

function countIncludedFiles(node: import("../core/types.js").FileNode): number {
	if (node.type === "file") return node.skipReason ? 0 : 1;

	return (node.children ?? []).reduce(
		(sum, child) => sum + countIncludedFiles(child),
		0,
	);
}

export type RunFlnPipelineInternal = {
	allowNoFilesIncluded?: boolean;
};

export async function runFlnPipeline(
	options: FlnOptions = {},
	internal: RunFlnPipelineInternal = {},
): Promise<FlnPipelineResult> {
	validateCopyOptions(options);

	const input = resolve(options.input ?? process.cwd());
	const inputStats = await stat(input);
	if (!inputStats.isDirectory())
		throw flnError(
			"INPUT_NOT_DIRECTORY",
			`Input must be a directory, got file: ${input}`,
			{
				hint: "Pass a directory path to input or run fln from the project root.",
			},
		);

	const stdinPaths = options.stdinPaths ?? [];
	const stdinCanonical =
		stdinPaths.length > 0
			? stdinPaths
					.map((p) => toCanonicalRelative(p, input))
					.filter((p): p is string => p !== null && p !== "")
			: [];
	const stdinSet =
		stdinCanonical.length > 0 ? new Set(stdinCanonical) : undefined;

	const projectMetadata = await getProjectMetadata(input);

	const {
		fileConfig,
		configPath,
		loaded: configLoaded,
		parseError,
	} = await resolveFileConfigAtInput(input, {
		ignoreConfig: options.ignoreConfig,
	});
	if (parseError)
		throw flnError("INVALID_CONFIG", parseError, { path: configPath });

	const format: "json" | "md" = options.format ?? fileConfig.format ?? "md";

	const outputOverride =
		options.output === "-"
			? "-"
			: options.output === undefined
				? undefined
				: resolveFromBase(options.output, input);

	const maxFileSize =
		options.maxFileSize === undefined
			? undefined
			: typeof options.maxFileSize === "string"
				? parseByteSize(options.maxFileSize)
				: options.maxFileSize;
	const maxTotalSize =
		options.maxTotalSize === undefined
			? undefined
			: typeof options.maxTotalSize === "string"
				? parseByteSize(options.maxTotalSize)
				: options.maxTotalSize;

	const userConfig = {
		output: outputOverride,
		overwrite: options.overwrite,
		exclude: options.exclude,
		include: [...(options.include ?? []), ...stdinCanonical],
		only: options.only,
		onlyMode: options.onlyMode,
		relevant: options.relevant,
		includeHidden: options.includeHidden,
		gitignore: options.gitignore,
		maxFileSize,
		maxTotalSize,
		maxTokens: options.maxTokens,
		maxContentTokens: options.maxContentTokens,
		tokenModel: options.tokenModel,
		contents: options.contents,
		tree: options.tree,
		format,
		followSymlinks: options.followSymlinks,
		ansi: options.ansi,
		logLevel: options.logLevel ?? "silent",
		date: options.date,
		banner: options.banner,
		bannerFile: options.bannerFile,
		footer: options.footer,
		footerFile: options.footerFile,
		dryRun: options.dryRun,
		strictLimits: options.strictLimits,
		compress: options.compress,
		outline: options.outline,
		diffHunks: options.diffHunks,
		since: options.since,
		encoding: options.encoding,
		securityPatterns: options.securityPatterns,
		securityCheck: options.securityCheck,
		outputSplit: options.outputSplit,
		strictToctou: options.strictToctou,
		annotateTree: options.annotateTree,
		collectTodo: options.collectTodo,
		copy: options.copy,
	};

	const config = resolveConfig(input, fileConfig, userConfig);

	validateFormatOptions(config.format, config.outputSplit);

	let copyTempDirectory: string | undefined;
	if (config.copy) {
		copyTempDirectory = await mkdtemp(join(tmpdir(), "fln-copy-"));
		copyTempDirectoryTracker?.(copyTempDirectory);
		config.overwrite = true;
	}

	const outputForResolve =
		config.copy && copyTempDirectory
			? join(
					copyTempDirectory,
					projectMetadata.version
						? `${projectMetadata.name}-${projectMetadata.version}.${config.format}`
						: `${projectMetadata.name}.${config.format}`,
				)
			: config.output === "-"
				? "-"
				: resolveFromBase(config.output, input);

	config.output = await resolveOutputPath(
		outputForResolve,
		input,
		projectMetadata,
		config.overwrite,
		config.format,
	);

	const outputCanonical =
		config.output === "-" ? null : toCanonicalRelative(config.output, input);
	if (outputCanonical && outputCanonical !== "")
		config.excludedPaths = [outputCanonical];

	async function resolveBannerFooterFile(
		filePath: string | undefined,
	): Promise<{ content: string; excludedPath?: string }> {
		if (filePath) {
			const absolutePath = resolveFromBase(filePath, input);
			const content = await readFile(absolutePath, "utf8");
			const excludedPath =
				toCanonicalRelative(absolutePath, input) ?? undefined;

			return { content, excludedPath };
		}

		return { content: "" };
	}

	const [bannerFileResult, footerFileResult] = await Promise.all([
		resolveBannerFooterFile(config.bannerFile),
		resolveBannerFooterFile(config.footerFile),
	]);

	const bannerParts = [config.banner, bannerFileResult.content].filter(
		Boolean,
	) as string[];
	const footerParts = [config.footer, footerFileResult.content].filter(
		Boolean,
	) as string[];
	config.banner = bannerParts.length > 0 ? bannerParts.join("\n\n") : undefined;
	config.footer = footerParts.length > 0 ? footerParts.join("\n\n") : undefined;

	if (bannerFileResult.excludedPath)
		config.excludedPaths.push(bannerFileResult.excludedPath);
	if (footerFileResult.excludedPath)
		config.excludedPaths.push(footerFileResult.excludedPath);

	if (config.outline) config.contents = true;

	if (!config.contents) {
		config.maxFileSize = Number.MAX_SAFE_INTEGER;
		config.maxTotalSize = 0;
	}

	if (config.maxFileSize <= 0)
		throw flnError("INVALID_CONFIG", "Max file size must be greater than 0.");

	if (config.maxTotalSize < 0)
		throw flnError("INVALID_CONFIG", "Max total size must be 0 or greater.");

	if (config.maxTokens < 0)
		throw flnError("INVALID_CONFIG", "Max tokens must be 0 or greater.");

	if (config.maxContentTokens < 0)
		throw flnError(
			"INVALID_CONFIG",
			"Max content tokens must be 0 or greater.",
		);

	const logger = createLogger({
		ansi: config.ansi,
		logLevel: config.logLevel,
	});

	if (
		options.ignoreConfig &&
		(config.logLevel === "verbose" || config.logLevel === "debug")
	)
		logger.info(
			`${symbols.info} Ignoring ${defaultConfigFileName} (--ignore-config)`,
		);
	else if (configLoaded)
		logger.info(`${symbols.info} Using config: ${basename(configPath)}`);

	const onlyMode = config.onlyMode ?? config.only.length > 0;

	const scan = await scanTree(
		{
			projectName: projectMetadata.name,
			input: config.input,
			exclude: config.exclude,
			include: config.include,
			only: config.only,
			onlyMode,
			excludedPaths: config.excludedPaths,
			includeHidden: config.includeHidden,
			gitignore: config.gitignore,
			maxFileSize: config.maxFileSize,
			maxTotalSize: config.maxTotalSize,
			tokenModel: config.tokenModel,
			contents: config.contents,
			followSymlinks: config.followSymlinks,
			dryRun: config.dryRun,
			encoding: config.encoding,
			securityPatterns: config.securityPatterns,
			securityCheck: config.securityCheck,
			onProgress: options.onProgress,
		},
		logger,
	);

	if (config.relevant.length > 0 && scan.stats.filesIncluded > 0) {
		const { root: prunedRoot, relevantSet } = await resolveRelevantFiles(
			scan.root,
			config.input,
			config.relevant,
		);
		scan.root = prunedRoot;
		scan.stats.filesIncluded = relevantSet.size;
	}

	if (stdinSet && stdinSet.size > 0) {
		scan.root = pruneTree(scan.root, stdinSet) ?? {
			...scan.root,
			children: [],
		};
		scan.stats.filesIncluded = countIncludedFiles(scan.root);
	}

	if (scan.stats.filesIncluded === 0 && !internal.allowNoFilesIncluded)
		throw flnError("NO_FILES_INCLUDED", "No files included.", {
			hint: "Try --include-hidden, -i <path>, --only <glob>, --relevant <seed>, --stdin, or --no-gitignore.",
		});

	const outputPath = config.dryRun || config.copy ? "" : config.output;

	return { scan, config, outputPath, logger, copyTempDirectory };
}
