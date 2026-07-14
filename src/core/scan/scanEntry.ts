import type { Dirent } from "node:fs";
import { lstat, readlink, stat } from "node:fs/promises";
import { sep } from "node:path";
import { toIgnoreSafePath, toPosixPath } from "../../path/index.js";
import type { FileNode } from "../types.js";
import { buildDirectoryNode } from "./buildDirectoryNode.js";
import { buildFileNode } from "./buildFileNode.js";
import { resolveFollowedSymlink } from "./symlinkPolicy.js";
import type { ScanContext, ScanEntryFn } from "./types.js";

export function createScanEntry(ctx: ScanContext): ScanEntryFn {
	return async function scanEntry(
		currentPath: string,
		relativePath: string,
		dirent?: Dirent,
	): Promise<FileNode | undefined> {
		const normalizedRelativePath = toPosixPath(relativePath);
		const name = dirent?.name ?? currentPath.split(sep).pop() ?? "";

		if (
			normalizedRelativePath !== "" &&
			ctx.excludedPathSet.has(normalizedRelativePath)
		)
			return undefined;

		const pathForCheck =
			normalizedRelativePath === ""
				? ""
				: dirent?.isDirectory()
					? `${normalizedRelativePath}/`
					: normalizedRelativePath;
		const safePath = toIgnoreSafePath(pathForCheck, ctx.options.input);
		const isForceIncluded =
			ctx.forceIncludeMatcher !== undefined &&
			safePath !== null &&
			safePath !== "" &&
			ctx.forceIncludeMatcher.ignores(safePath);

		const isDirectory = pathForCheck.endsWith("/");
		if (
			ctx.options.onlyMode &&
			ctx.onlyMatcher !== undefined &&
			safePath !== null &&
			safePath !== "" &&
			!ctx.onlyMatcher.ignores(safePath) &&
			pathForCheck !== "" &&
			!isDirectory
		)
			return undefined;

		if (
			!isForceIncluded &&
			pathForCheck !== "" &&
			ctx.ignoreMatcher.ignoresSafePath(safePath)
		)
			return undefined;

		if (
			!ctx.options.includeHidden &&
			!isForceIncluded &&
			name.startsWith(".") &&
			name !== "."
		)
			return undefined;

		try {
			let symlinkTarget: string | undefined;
			const isSymlink = dirent ? dirent.isSymbolicLink() : undefined;

			if (isSymlink) {
				symlinkTarget = await readlink(currentPath);
				const symlinkResult = await resolveFollowedSymlink(ctx, {
					currentPath,
					normalizedRelativePath,
					name,
					symlinkTarget,
				});
				if (symlinkResult !== "continue") return symlinkResult;

				const statsResult = await stat(currentPath);

				if (statsResult.isFile())
					return await buildFileNode(ctx, {
						currentPath,
						normalizedRelativePath,
						name,
						fileSize: statsResult.size,
						scanMtimeMs: statsResult.mtimeMs,
						symlinkTarget,
						isForceIncluded,
					});

				if (statsResult.isDirectory())
					return await buildDirectoryNode(
						ctx,
						{
							currentPath,
							normalizedRelativePath,
							name,
							symlinkTarget,
						},
						scanEntry,
					);

				return undefined;
			}

			if (dirent?.isDirectory())
				return await buildDirectoryNode(
					ctx,
					{
						currentPath,
						normalizedRelativePath,
						name,
					},
					scanEntry,
				);

			if (dirent?.isFile()) {
				const statsResult = await stat(currentPath);

				return await buildFileNode(ctx, {
					currentPath,
					normalizedRelativePath,
					name,
					fileSize: statsResult.size,
					scanMtimeMs: statsResult.mtimeMs,
					isForceIncluded,
				});
			}

			if (dirent) return undefined;

			const entryStats = await lstat(currentPath);

			if (entryStats.isSymbolicLink()) {
				symlinkTarget = await readlink(currentPath);
				const symlinkResult = await resolveFollowedSymlink(ctx, {
					currentPath,
					normalizedRelativePath,
					name,
					symlinkTarget,
				});
				if (symlinkResult !== "continue") return symlinkResult;
			}

			const statsResult = ctx.followsSymlinks
				? await stat(currentPath)
				: entryStats;

			if (statsResult.isFile())
				return await buildFileNode(ctx, {
					currentPath,
					normalizedRelativePath,
					name,
					fileSize: statsResult.size,
					scanMtimeMs: statsResult.mtimeMs,
					symlinkTarget,
					isForceIncluded,
				});

			if (statsResult.isDirectory())
				return await buildDirectoryNode(
					ctx,
					{
						currentPath,
						normalizedRelativePath,
						name,
						symlinkTarget,
					},
					scanEntry,
				);
		} catch (error) {
			ctx.stats.errors++;
			ctx.logger.warn(
				`Failed to access ${normalizedRelativePath || "."}: ${String(error)}`,
			);
		}

		return undefined;
	};
}
