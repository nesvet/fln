import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { toPosixPath } from "../path/index.js";


export function getChangedFilesSince(ref: string, cwd: string): string[] {
	const result = spawnSync("git", [ "diff", "--name-only", ref ], {
		cwd,
		encoding: "utf8",
		stdio: [ "pipe", "pipe", "pipe" ]
	});
	
	if (result.error)
		throw new Error(`fln: git not found (${result.error.message}). Install git and ensure it is in PATH.`);
	
	if (result.status !== 0) {
		const stderr = (result.stderr ?? "").trim();
		
		throw new Error(
			stderr ?
				`fln: git diff failed: ${stderr}` :
				`fln: git diff failed (exit ${result.status}). Not a git repository or invalid ref: ${ref}`
		);
	}
	
	const output = (result.stdout ?? "").trim();
	if (!output)
		return [];
	
	return output.split("\n").filter(Boolean);
}

export function filterPathsUnderBase(gitPaths: string[], cwd: string, inputBase: string): string[] {
	return gitPaths
		.map(gitPath => {
			const absolutePath = join(cwd, gitPath);
			const relativeToInput = relative(inputBase, absolutePath);
			if (relativeToInput.startsWith("..") || relativeToInput === "")
				return null;
			
			return toPosixPath(relativeToInput);
		})
		.filter((path): path is string => path !== null && path !== "");
}
