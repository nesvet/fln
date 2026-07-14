import { readdir } from "node:fs/promises";
import { relative, sep } from "node:path";
import { compareFilePriority } from "../filePriority.js";
import type { FileNode } from "../types.js";
import type { DirectoryNodeInput, ScanContext, ScanEntryFn } from "./types.js";

export async function buildDirectoryNode(
	ctx: ScanContext,
	input: DirectoryNodeInput,
	scanEntry: ScanEntryFn,
): Promise<FileNode> {
	ctx.stats.directories++;
	await ctx.ignoreMatcher.addGitignoreForDirectory(input.currentPath);

	const entries = await ctx.ioLimit(() =>
		readdir(input.currentPath, { withFileTypes: true }),
	);

	ctx.totalEstimate = Math.max(
		ctx.totalEstimate,
		ctx.processedItems + entries.length,
	);

	const children = (
		await Promise.all(
			entries.map((entry) => {
				const childPath = `${input.currentPath}${sep}${entry.name}`;
				const childRelativePath = relative(ctx.options.input, childPath);

				return scanEntry(childPath, childRelativePath, entry);
			}),
		)
	)
		.filter((node): node is FileNode => node !== undefined)
		.sort((left, right) => {
			if (left.type !== right.type) return left.type === "directory" ? 1 : -1;

			if (left.type === "file" && right.type === "file") {
				const priority = compareFilePriority(left, right);
				if (priority !== 0) return priority;
			}

			return left.name.localeCompare(right.name, undefined, {
				numeric: true,
				sensitivity: "base",
			});
		});

	return {
		name: input.name,
		path: input.normalizedRelativePath,
		type: "directory",
		size: 0,
		children,
		target: input.symlinkTarget,
	};
}
