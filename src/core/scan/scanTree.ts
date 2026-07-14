import { realpath } from "node:fs/promises";
import { cpus } from "node:os";
import { sep } from "node:path";
import ignore from "ignore";
import pLimit from "p-limit";
import { flnError, type Logger } from "../../infra/index.js";
import { toCanonicalRelative } from "../../path/index.js";
import { normalizeIncludePattern } from "../../pattern/index.js";
import { IgnoreMatcher } from "../ignoreMatcher.js";
import { getSecurityPatterns } from "../securityMatcher.js";
import type { ScanOptions, ScanResult, ScanStats } from "../types.js";
import { createScanEntry } from "./scanEntry.js";
import { shouldFollowSymlinks } from "./symlinkPolicy.js";
import type { ScanContext } from "./types.js";

export async function scanTree(
	options: ScanOptions,
	logger: Logger,
): Promise<ScanResult> {
	const stats: ScanStats = {
		filesScanned: 0,
		filesIncluded: 0,
		directories: 0,
		binary: 0,
		skipped: 0,
		errors: 0,
		totalSizeBytes: 0,
		outputSizeBytes: 0,
		outputTokenCount: 0,
	};
	const ignoreMatcher = new IgnoreMatcher({
		input: options.input,
		exclude: options.exclude,
		gitignore: options.gitignore,
		logger,
	});
	const normalizedIncludePatterns = options.include
		.map((pattern) => normalizeIncludePattern(pattern, options.input))
		.filter((p): p is string => p !== null);
	const normalizedOnlyPatterns = options.only
		.map((pattern) => normalizeIncludePattern(pattern, options.input))
		.filter((p): p is string => p !== null);
	if (options.onlyMode && normalizedOnlyPatterns.length === 0) {
		const rootName = options.input.split(sep).pop() ?? "";

		return {
			projectName: options.projectName,
			root: {
				name: rootName,
				path: "",
				type: "directory",
				size: 0,
				children: [],
			},
			stats,
		};
	}

	const forceIncludeMatcher =
		normalizedIncludePatterns.length > 0
			? ignore().add(normalizedIncludePatterns)
			: undefined;
	const onlyMatcher =
		normalizedOnlyPatterns.length > 0
			? ignore().add(normalizedOnlyPatterns)
			: undefined;
	const concurrencyLimit = Math.max(8, Math.min(64, cpus().length * 4));
	const ioLimit = pLimit(concurrencyLimit);
	const excludedPathSet = new Set(
		options.excludedPaths
			.map((path) => toCanonicalRelative(path, options.input))
			.filter((p): p is string => p !== null && p !== ""),
	);
	const visitedRealPaths = new Set<string>();
	const securityPatterns = getSecurityPatterns(
		options.securityPatterns,
		options.securityCheck ?? "default",
	);
	const followsSymlinks = shouldFollowSymlinks(options.followSymlinks);
	const symlinkInRootOnly = options.followSymlinks === "in-root-only";
	let inputRealPath = options.input;

	if (followsSymlinks)
		try {
			inputRealPath = await realpath(options.input);
			visitedRealPaths.add(inputRealPath);
		} catch {
			logger.debug("Failed to resolve root real path.");
		}

	const ctx: ScanContext = {
		options,
		logger,
		stats,
		ignoreMatcher,
		ioLimit,
		excludedPathSet,
		visitedRealPaths,
		securityPatterns,
		forceIncludeMatcher,
		onlyMatcher,
		followsSymlinks,
		symlinkInRootOnly,
		inputRealPath,
		processedItems: 0,
		totalEstimate: 0,
		forceIncludeMatchCount: 0,
	};

	const scanEntry = createScanEntry(ctx);
	const rootNode = await scanEntry(options.input, "");
	if (rootNode?.type !== "directory")
		throw flnError(
			"NO_FILES_INCLUDED",
			"Root directory is empty or all files were excluded.",
			{
				hint: "Try --include-hidden, -i <path>, --only <glob>, or --no-gitignore.",
			},
		);

	if (normalizedIncludePatterns.length > 0 && ctx.forceIncludeMatchCount === 0)
		logger.warn(
			`No files matched include patterns: ${options.include.join(", ")}`,
		);

	return { projectName: options.projectName, root: rootNode, stats };
}
