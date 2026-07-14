import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { FileNode, ScanOptions } from "../types.js";
import type { ScanContext } from "./types.js";

export function isPathInsideRoot(
	resolvedPath: string,
	rootRealPath: string,
): boolean {
	const normalizedRoot = resolve(rootRealPath);
	const normalizedResolved = resolve(resolvedPath);

	return (
		normalizedResolved === normalizedRoot ||
		normalizedResolved.startsWith(`${normalizedRoot}${sep}`)
	);
}

export function shouldFollowSymlinks(
	mode: ScanOptions["followSymlinks"],
): boolean {
	return mode === true || mode === "in-root-only";
}

type FollowedSymlinkInput = {
	currentPath: string;
	normalizedRelativePath: string;
	name: string;
	symlinkTarget: string;
};

export type FollowedSymlinkResult = FileNode | "continue";

export async function resolveFollowedSymlink(
	ctx: ScanContext,
	input: FollowedSymlinkInput,
): Promise<FollowedSymlinkResult> {
	const { name, normalizedRelativePath, symlinkTarget, currentPath } = input;
	const leaf: FileNode = {
		name,
		path: normalizedRelativePath,
		type: "symlink",
		size: 0,
		target: symlinkTarget,
	};

	if (!ctx.followsSymlinks) return leaf;

	const resolvedPath = await realpath(currentPath);
	if (
		ctx.symlinkInRootOnly &&
		!isPathInsideRoot(resolvedPath, ctx.inputRealPath)
	) {
		ctx.stats.skipped++;
		ctx.logger.warn(`Symlink escapes input root: ${normalizedRelativePath}`);

		return { ...leaf, skipReason: "symlinkEscape" };
	}

	if (ctx.visitedRealPaths.has(resolvedPath)) {
		ctx.stats.skipped++;

		return { ...leaf, skipReason: "symlinkCycle" };
	}

	ctx.visitedRealPaths.add(resolvedPath);

	return "continue";
}
