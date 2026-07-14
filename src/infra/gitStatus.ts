import { spawnSync } from "node:child_process";

export type GitDoctorInfo = {
	available: boolean;
	branch?: string;
	dirty?: boolean;
};

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string } {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["pipe", "pipe", "pipe"],
	});

	if (result.error || result.status !== 0) return { ok: false, stdout: "" };

	return { ok: true, stdout: (result.stdout ?? "").trim() };
}

export function getGitDoctorInfo(cwd: string): GitDoctorInfo {
	const inside = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
	if (!inside.ok || inside.stdout !== "true") return { available: false };

	const branchResult = runGit(cwd, ["branch", "--show-current"]);
	const branch =
		branchResult.ok && branchResult.stdout ? branchResult.stdout : undefined;

	const statusResult = runGit(cwd, ["status", "--porcelain"]);
	const dirty = statusResult.ok && statusResult.stdout.length > 0;

	return {
		available: true,
		branch,
		dirty,
	};
}
