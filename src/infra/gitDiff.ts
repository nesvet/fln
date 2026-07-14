import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { toPosixPath } from "../path/index.js";
import { flnError } from "./flnError.js";

export function getChangedFilesSince(ref: string, cwd: string): string[] {
	const result = spawnSync("git", ["diff", "--name-only", ref], {
		cwd,
		encoding: "utf8",
		stdio: ["pipe", "pipe", "pipe"],
	});

	if (result.error)
		throw flnError(
			"GIT_NOT_FOUND",
			`Git not found (${result.error.message}).`,
			{ hint: "Install git and ensure it is in PATH." },
		);

	if (result.status !== 0) {
		const stderr = (result.stderr ?? "").trim();

		throw flnError(
			"GIT_REF_INVALID",
			stderr
				? `Git diff failed: ${stderr}`
				: `Git diff failed (exit ${result.status ?? "unknown"}). Not a git repository or invalid ref: ${ref}`,
		);
	}

	const output = (result.stdout ?? "").trim();
	if (!output) return [];

	return output.split("\n").filter(Boolean);
}

export function getFileUnifiedDiff(
	ref: string,
	relativePath: string,
	cwd: string,
): string | null {
	const result = spawnSync("git", ["diff", "-U3", ref, "--", relativePath], {
		cwd,
		encoding: "utf8",
		stdio: ["pipe", "pipe", "pipe"],
	});

	if (result.status !== 0) return null;

	const output = (result.stdout ?? "").trim();

	return output.length > 0 ? output : null;
}

const MAX_PATHS_PER_DIFF_COMMAND = 500;
const diffSectionSplit = /(?=^diff --git )/m;
const diffPathPattern = /^diff --git a\/(.+?) b\/(.+)$/m;

export function getBatchedUnifiedDiffs(
	ref: string,
	relativePaths: string[],
	cwd: string,
): Map<string, string> {
	const diffs = new Map<string, string>();
	if (relativePaths.length === 0) return diffs;

	for (
		let offset = 0;
		offset < relativePaths.length;
		offset += MAX_PATHS_PER_DIFF_COMMAND
	) {
		const chunk = relativePaths.slice(
			offset,
			offset + MAX_PATHS_PER_DIFF_COMMAND,
		);
		const result = spawnSync("git", ["diff", "-U3", ref, "--", ...chunk], {
			cwd,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		if (result.status !== 0) continue;

		const output = (result.stdout ?? "").trim();
		if (!output) continue;

		for (const section of output.split(diffSectionSplit)) {
			const pathMatch = section.match(diffPathPattern);
			if (pathMatch) {
				const [, , afterPath] = pathMatch;
				diffs.set(afterPath, section);
			}
		}
	}

	return diffs;
}

export function filterPathsUnderBase(
	gitPaths: string[],
	cwd: string,
	inputBase: string,
): string[] {
	return gitPaths
		.map((gitPath) => {
			const absolutePath = join(cwd, gitPath);
			const relativeToInput = relative(inputBase, absolutePath);
			if (relativeToInput.startsWith("..") || relativeToInput === "")
				return null;

			return toPosixPath(relativeToInput);
		})
		.filter((path): path is string => path !== null && path !== "");
}
