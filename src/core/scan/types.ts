import type { Dirent } from "node:fs";
import type { Ignore } from "ignore";
import type { LimitFunction } from "p-limit";
import type { Logger } from "../../infra/index.js";
import type { IgnoreMatcher } from "../ignoreMatcher.js";
import type { getSecurityPatterns } from "../securityMatcher.js";
import type { FileNode, ScanOptions, ScanStats } from "../types.js";

export type ScanEntryFn = (
	currentPath: string,
	relativePath: string,
	dirent?: Dirent,
) => Promise<FileNode | undefined>;

export type ScanContext = {
	options: ScanOptions;
	logger: Logger;
	stats: ScanStats;
	ignoreMatcher: IgnoreMatcher;
	ioLimit: LimitFunction;
	excludedPathSet: Set<string>;
	visitedRealPaths: Set<string>;
	securityPatterns: ReturnType<typeof getSecurityPatterns>;
	forceIncludeMatcher?: Ignore;
	onlyMatcher?: Ignore;
	followsSymlinks: boolean;
	symlinkInRootOnly: boolean;
	inputRealPath: string;
	processedItems: number;
	totalEstimate: number;
	forceIncludeMatchCount: number;
};

export type FileNodeInput = {
	currentPath: string;
	normalizedRelativePath: string;
	name: string;
	fileSize: number;
	scanMtimeMs?: number;
	symlinkTarget?: string;
	isForceIncluded: boolean;
};

export type DirectoryNodeInput = {
	currentPath: string;
	normalizedRelativePath: string;
	name: string;
	symlinkTarget?: string;
};
