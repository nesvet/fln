import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getBatchedUnifiedDiffs,
	getChangedFilesSince,
	getFileUnifiedDiff,
} from "../src/infra/gitDiff.js";

function initGitRepo(dir: string): void {
	execSync("git init", { cwd: dir });
	execSync("git config user.email test@test && git config user.name Test", {
		cwd: dir,
	});
}

function gitCommit(dir: string, message: string): void {
	execSync("git add -A", { cwd: dir });
	execSync(`git commit -m "${message}"`, { cwd: dir });
}

describe("gitDiff — getFileUnifiedDiff", () => {
	it("returns null for unchanged file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-gitdiff-unchanged-"));
		initGitRepo(dir);
		await writeFile(join(dir, "a.ts"), "export const a = 1;\n");
		gitCommit(dir, "initial");

		const diff = getFileUnifiedDiff("HEAD", "a.ts", dir);
		expect(diff).toBeNull();
	});

	it("returns diff for changed file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-gitdiff-changed-"));
		initGitRepo(dir);
		await writeFile(join(dir, "a.ts"), "export const a = 1;\n");
		gitCommit(dir, "initial");
		await writeFile(join(dir, "a.ts"), "export const a = 2;\n");

		const diff = getFileUnifiedDiff("HEAD", "a.ts", dir);
		expect(diff).not.toBeNull();
		expect(diff).toContain("diff --git");
		expect(diff).toContain("export const a = 2");
	});
});

describe("gitDiff — getChangedFilesSince", () => {
	it("returns list of changed files", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-gitdiff-list-"));
		initGitRepo(dir);
		await writeFile(join(dir, "a.ts"), "export const a = 1;\n");
		await writeFile(join(dir, "b.ts"), "export const b = 1;\n");
		await writeFile(join(dir, "c.ts"), "export const c = 1;\n");
		gitCommit(dir, "initial");
		await writeFile(join(dir, "a.ts"), "export const a = 2;\n");
		await writeFile(join(dir, "c.ts"), "export const c = 2;\n");

		const changed = getChangedFilesSince("HEAD", dir);
		expect(changed).toContain("a.ts");
		expect(changed).toContain("c.ts");
		expect(changed).not.toContain("b.ts");
	});

	it("returns empty array when no changes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-gitdiff-none-"));
		initGitRepo(dir);
		await writeFile(join(dir, "a.ts"), "export const a = 1;\n");
		gitCommit(dir, "initial");

		const changed = getChangedFilesSince("HEAD", dir);
		expect(changed).toEqual([]);
	});
});

describe("gitDiff — getBatchedUnifiedDiffs (P3)", () => {
	it("returns diffs for multiple files in one git call", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-gitdiff-batch-"));
		initGitRepo(dir);
		await writeFile(join(dir, "a.ts"), "export const a = 1;\n");
		await writeFile(join(dir, "b.ts"), "export const b = 1;\n");
		await writeFile(join(dir, "c.ts"), "export const c = 1;\n");
		gitCommit(dir, "initial");
		await writeFile(join(dir, "a.ts"), "export const a = 2;\n");
		await writeFile(join(dir, "c.ts"), "export const c = 2;\n");

		const diffs = getBatchedUnifiedDiffs("HEAD", ["a.ts", "b.ts", "c.ts"], dir);
		expect(diffs.has("a.ts")).toBe(true);
		expect(diffs.has("c.ts")).toBe(true);
		expect(diffs.has("b.ts")).toBe(false);
		expect(diffs.get("a.ts")).toContain("export const a = 2");
	});

	it("returns empty map for no paths", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-gitdiff-empty-batch-"));
		initGitRepo(dir);

		const diffs = getBatchedUnifiedDiffs("HEAD", [], dir);
		expect(diffs.size).toBe(0);
	});

	it("matches per-file results for batched call", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-gitdiff-match-"));
		initGitRepo(dir);
		await writeFile(join(dir, "a.ts"), "export const a = 1;\n");
		gitCommit(dir, "initial");
		await writeFile(join(dir, "a.ts"), "export const a = 2;\n");

		const perFile = getFileUnifiedDiff("HEAD", "a.ts", dir);
		const batched = getBatchedUnifiedDiffs("HEAD", ["a.ts"], dir);
		expect(batched.get("a.ts")).toBe(perFile ?? undefined);
	});
});
