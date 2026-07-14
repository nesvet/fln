import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fln, formatDiffText } from "../src/api/index.js";

async function createSnapshotPair(): Promise<{
	beforePath: string;
	afterPath: string;
}> {
	const dir = await mkdtemp(join(tmpdir(), "fln-diff-"));

	const beforeContent = [
		"<!-- fln 2.0.0 -->",
		"",
		"# Codebase Snapshot: test",
		"",
		"## Directory Tree",
		"```text",
		"├── README.md",
		"├── index.ts",
		"└── utils.ts",
		"```",
		"",
		"## Source Files",
		"",
		"### README.md",
		"```md",
		"# Test Project",
		"```",
		"",
		"### index.ts",
		"```ts",
		"import { helper } from './utils';",
		"export function main() { helper(); }",
		"```",
		"",
		"### utils.ts",
		"```ts",
		"export function helper() { return 'hello'; }",
		"```",
		"",
	].join("\n");

	const afterContent = [
		"<!-- fln 2.0.0 -->",
		"",
		"# Codebase Snapshot: test",
		"",
		"## Directory Tree",
		"```text",
		"├── README.md",
		"├── index.ts",
		"├── utils.ts",
		"└── new-file.ts",
		"```",
		"",
		"## Source Files",
		"",
		"### README.md",
		"```md",
		"# Test Project v2",
		"```",
		"",
		"### index.ts",
		"```ts",
		"import { helper } from './utils';",
		"import { newFunc } from './new-file';",
		"export function main() { helper(); newFunc(); }",
		"```",
		"",
		"### utils.ts",
		"```ts",
		"export function helper() { return 'hello'; }",
		"```",
		"",
		"### new-file.ts",
		"```ts",
		"export function newFunc() { return 'new'; }",
		"```",
		"",
	].join("\n");

	const beforePath = join(dir, "before.md");
	const afterPath = join(dir, "after.md");
	await writeFile(beforePath, beforeContent, "utf8");
	await writeFile(afterPath, afterContent, "utf8");

	return { beforePath, afterPath };
}

async function createJsonSnapshotPair(): Promise<{
	beforePath: string;
	afterPath: string;
}> {
	const dir = await mkdtemp(join(tmpdir(), "fln-diff-json-"));

	const beforeJson = {
		schemaVersion: 2,
		version: "2.0.0",
		projectName: "test",
		input: "/test",
		options: { tree: true, contents: true, format: "json" },
		root: { name: "test", path: "", type: "directory", size: 0, children: [] },
		files: [
			{
				path: "index.ts",
				language: "ts",
				isBinary: false,
				content: "export function main() {}",
			},
			{
				path: "utils.ts",
				language: "ts",
				isBinary: false,
				content: "export function helper() { return 'hello'; }",
			},
		],
		stats: {
			filesScanned: 2,
			filesIncluded: 2,
			directories: 1,
			binary: 0,
			skipped: 0,
			errors: 0,
			totalSizeBytes: 100,
		},
	};

	const afterJson = {
		schemaVersion: 2,
		version: "2.0.0",
		projectName: "test",
		input: "/test",
		options: { tree: true, contents: true, format: "json" },
		root: { name: "test", path: "", type: "directory", size: 0, children: [] },
		files: [
			{
				path: "index.ts",
				language: "ts",
				isBinary: false,
				content: "export function main() { console.log('changed'); }",
			},
			{
				path: "utils.ts",
				language: "ts",
				isBinary: false,
				content: "export function helper() { return 'hello'; }",
			},
			{
				path: "new-file.ts",
				language: "ts",
				isBinary: false,
				content: "export function newFunc() {}",
			},
		],
		stats: {
			filesScanned: 3,
			filesIncluded: 3,
			directories: 1,
			binary: 0,
			skipped: 0,
			errors: 0,
			totalSizeBytes: 150,
		},
	};

	const beforePath = join(dir, "before.json");
	const afterPath = join(dir, "after.json");
	await writeFile(beforePath, JSON.stringify(beforeJson, null, "\t"), "utf8");
	await writeFile(afterPath, JSON.stringify(afterJson, null, "\t"), "utf8");

	return { beforePath, afterPath };
}

describe("fln.diff — markdown snapshots", () => {
	it("detects added files", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.added).toContain("new-file.ts");
		expect(result.stats.filesAdded).toBe(1);
	});

	it("detects removed files", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: afterPath, after: beforePath });

		expect(result.removed).toContain("new-file.ts");
		expect(result.stats.filesRemoved).toBe(1);
	});

	it("detects changed files", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed.some((c) => c.path === "index.ts")).toBe(true);
		expect(result.changed.some((c) => c.path === "README.md")).toBe(true);
		expect(result.stats.filesChanged).toBe(2);
	});

	it("reports unchanged files as not changed", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed.some((c) => c.path === "utils.ts")).toBe(false);
	});

	it("computes token and size delta", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.stats.tokenDelta).not.toBe(0);
		expect(result.stats.sizeDelta).not.toBe(0);
	});

	it("returns schemaVersion 1", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.schemaVersion).toBe(1);
		expect(result.generated).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
	});
});

describe("fln.diff — JSON snapshots", () => {
	it("detects added files in JSON format", async () => {
		const { beforePath, afterPath } = await createJsonSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.added).toContain("new-file.ts");
		expect(result.stats.filesAdded).toBe(1);
	});

	it("detects changed files in JSON format", async () => {
		const { beforePath, afterPath } = await createJsonSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed.some((c) => c.path === "index.ts")).toBe(true);
		expect(result.stats.filesChanged).toBe(1);
	});

	it("detects removed files when reversed", async () => {
		const { beforePath, afterPath } = await createJsonSnapshotPair();
		const result = await fln.diff({ before: afterPath, after: beforePath });

		expect(result.removed).toContain("new-file.ts");
		expect(result.stats.filesRemoved).toBe(1);
	});
});

describe("fln.diff — no changes", () => {
	it("reports no changes when snapshots are identical", async () => {
		const { beforePath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: beforePath });

		expect(result.added).toHaveLength(0);
		expect(result.removed).toHaveLength(0);
		expect(result.changed).toHaveLength(0);
		expect(result.stats.filesAdded).toBe(0);
		expect(result.stats.filesRemoved).toBe(0);
		expect(result.stats.filesChanged).toBe(0);
		expect(result.stats.tokenDelta).toBe(0);
	});
});

describe("fln.diff — backtick-safe parsing (DF1)", () => {
	it("parses files fenced with 4+ backticks when the body contains ```", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-backtick-"));

		const before = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### doc.md",
			"````md",
			"Here is a code block:",
			"",
			"```ts",
			"const x = 1;",
			"```",
			"````",
			"",
		].join("\n");

		const after = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### doc.md",
			"````md",
			"Here is a code block:",
			"",
			"```ts",
			"const x = 1;",
			"const y = 2;",
			"```",
			"````",
			"",
		].join("\n");

		const beforePath = join(dir, "before.md");
		const afterPath = join(dir, "after.md");
		await writeFile(beforePath, before, "utf8");
		await writeFile(afterPath, after, "utf8");

		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed.some((c) => c.path === "doc.md")).toBe(true);
		expect(result.stats.filesChanged).toBe(1);
	});

	it("parses outline-labeled sections", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-outline-"));

		const before = [
			"### index.ts (outline)",
			"```ts",
			"export function main();",
			"```",
			"",
		].join("\n");

		const after = [
			"### index.ts (outline)",
			"```ts",
			"export function main();",
			"export function extra();",
			"```",
			"",
		].join("\n");

		const beforePath = join(dir, "before.md");
		const afterPath = join(dir, "after.md");
		await writeFile(beforePath, before, "utf8");
		await writeFile(afterPath, after, "utf8");

		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed.some((c) => c.path === "index.ts")).toBe(true);
	});
});

describe("fln.diff — error handling (DF6)", () => {
	it("throws READ_FAILED when snapshot file is missing", async () => {
		const { afterPath } = await createSnapshotPair();

		await expect(
			fln.diff({ before: "/nonexistent/snapshot.md", after: afterPath }),
		).rejects.toMatchObject({ code: "READ_FAILED" });
	});

	it("throws INVALID_CONFIG when JSON snapshot is malformed", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-badjson-"));
		const badJsonPath = join(dir, "bad.json");
		await writeFile(badJsonPath, "{ not valid json {{{", "utf8");
		const { afterPath } = await createJsonSnapshotPair();

		await expect(
			fln.diff({ before: badJsonPath, after: afterPath }),
		).rejects.toMatchObject({ code: "INVALID_CONFIG" });
	});
});

describe("formatDiffText", () => {
	it("produces human-readable diff", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });
		const text = formatDiffText(result);

		expect(text).toContain("Snapshot Diff");
		expect(text).toContain("Added files");
		expect(text).toContain("Changed files");
		expect(text).toContain("new-file.ts");
		expect(text).toContain("index.ts");
	});

	it("shows 'No changes detected' when identical", async () => {
		const { beforePath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: beforePath });
		const text = formatDiffText(result);

		expect(text).toContain("No changes detected");
	});

	it("includes removed section when files removed", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: afterPath, after: beforePath });
		const text = formatDiffText(result);

		expect(text).toContain("Removed files");
		expect(text).toContain("new-file.ts");
	});
});

describe("fln.diff — DF4 content-hash (same-size edits)", () => {
	it("detects same-size content changes missed by size-only comparison", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-hash-"));

		const before = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### config.ts",
			"```ts",
			'export const name = "aaa";',
			"```",
			"",
		].join("\n");

		const after = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### config.ts",
			"```ts",
			'export const name = "bbb";',
			"```",
			"",
		].join("\n");

		const beforePath = join(dir, "before.md");
		const afterPath = join(dir, "after.md");
		await writeFile(beforePath, before, "utf8");
		await writeFile(afterPath, after, "utf8");

		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed.some((c) => c.path === "config.ts")).toBe(true);
		expect(result.stats.filesChanged).toBe(1);
		expect(result.stats.sizeDelta).toBe(0);
	});

	it("includes unified hunks when includeHunks is true", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-hunks-"));

		const before = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### index.ts",
			"```ts",
			"export function main() {",
			"  return 1;",
			"}",
			"```",
			"",
		].join("\n");

		const after = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### index.ts",
			"```ts",
			"export function main() {",
			"  return 2;",
			"}",
			"```",
			"",
		].join("\n");

		const beforePath = join(dir, "before.md");
		const afterPath = join(dir, "after.md");
		await writeFile(beforePath, before, "utf8");
		await writeFile(afterPath, after, "utf8");

		const result = await fln.diff({
			before: beforePath,
			after: afterPath,
			includeHunks: true,
		});

		const changed = result.changed.find((file) => file.path === "index.ts");
		expect(changed).toBeDefined();
		expect(changed?.hunks?.length).toBeGreaterThan(0);
		expect(changed?.hunks?.some((hunk) => hunk.includes("@@"))).toBe(true);
	});
});

describe("fln.diff — DF3 tree-delta", () => {
	it("detects tree additions from Directory Tree section", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.treeAdded).toContain("new-file.ts");
		expect(result.stats.treeAdded).toBe(1);
		expect(result.stats.treeRemoved).toBe(0);
	});

	it("detects tree removals when reversed", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const result = await fln.diff({ before: afterPath, after: beforePath });

		expect(result.treeRemoved).toContain("new-file.ts");
		expect(result.stats.treeRemoved).toBe(1);
	});

	it("reports empty tree-delta when snapshots are identical", async () => {
		const { beforePath } = await createSnapshotPair();
		const result = await fln.diff({ before: beforePath, after: beforePath });

		expect(result.treeAdded).toHaveLength(0);
		expect(result.treeRemoved).toHaveLength(0);
	});
});

describe("fln.diff — DF10 fidelity fields", () => {
	it("parses fidelityBefore and fidelityAfter from (outline) labels", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-fidelity-"));

		const before = [
			"### index.ts (outline)",
			"```ts",
			"export function main();",
			"```",
			"",
		].join("\n");

		const after = [
			"### index.ts (outline)",
			"```ts",
			"export function main();",
			"export function extra();",
			"```",
			"",
		].join("\n");

		const beforePath = join(dir, "before.md");
		const afterPath = join(dir, "after.md");
		await writeFile(beforePath, before, "utf8");
		await writeFile(afterPath, after, "utf8");

		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed).toHaveLength(1);
		expect(result.changed[0].fidelityBefore).toBe("outline");
		expect(result.changed[0].fidelityAfter).toBe("outline");
	});

	it("detects fidelity change from full to outline", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-fid-change-"));

		const before = [
			"### index.ts",
			"```ts",
			"export function main() { return 1; }",
			"```",
			"",
		].join("\n");

		const after = [
			"### index.ts (outline)",
			"```ts",
			"export function main();",
			"```",
			"",
		].join("\n");

		const beforePath = join(dir, "before.md");
		const afterPath = join(dir, "after.md");
		await writeFile(beforePath, before, "utf8");
		await writeFile(afterPath, after, "utf8");

		const result = await fln.diff({ before: beforePath, after: afterPath });

		expect(result.changed).toHaveLength(1);
		expect(result.changed[0].fidelityBefore).toBe("full");
		expect(result.changed[0].fidelityAfter).toBe("outline");
	});
});

describe("fln.diff — DF7 CLI (spawn)", () => {
	const cliPath = fileURLToPath(
		new URL("../src/cli/index.ts", import.meta.url),
	);

	async function runDiffSpawn(
		args: string[],
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		const proc = Bun.spawn(["bun", "run", cliPath, "diff", ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		return {
			stdout: stdout.trim(),
			stderr: stderr.trim(),
			exitCode: await proc.exited,
		};
	}

	it("prints human-readable diff text", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const { stdout, exitCode } = await runDiffSpawn([
			beforePath,
			afterPath,
			"--stdout",
			"--no-ansi",
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Snapshot Diff");
		expect(stdout).toContain("new-file.ts");
	});

	it("prints JSON diff with --format json", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const { stdout, exitCode } = await runDiffSpawn([
			beforePath,
			afterPath,
			"--format",
			"json",
			"--stdout",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as {
			schemaVersion: number;
			added: string[];
			treeAdded: string[];
		};

		expect(exitCode).toBe(0);
		expect(payload.schemaVersion).toBe(1);
		expect(payload.added).toContain("new-file.ts");
		expect(payload.treeAdded).toContain("new-file.ts");
	});

	it("writes diff to file with -o", async () => {
		const { beforePath, afterPath } = await createSnapshotPair();
		const dir = await mkdtemp(join(tmpdir(), "fln-diff-cli-out-"));
		const outputPath = join(dir, "result.md");
		const { exitCode } = await runDiffSpawn([
			beforePath,
			afterPath,
			"-o",
			outputPath,
			"--no-ansi",
		]);
		const output = await readFile(outputPath, "utf8");

		expect(exitCode).toBe(0);
		expect(output).toContain("Snapshot Diff");
	});

	it("exits 1 on mixed file/ref arguments", async () => {
		const { afterPath } = await createSnapshotPair();
		const { stderr, exitCode } = await runDiffSpawn([
			"/nonexistent/before.md",
			afterPath,
			"--stdout",
			"--no-ansi",
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain("INVALID_CONFIG");
	});

	it("exits 1 when too few arguments", async () => {
		const { stderr, exitCode } = await runDiffSpawn([
			"only-one.md",
			"--stdout",
			"--no-ansi",
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain("INVALID_CONFIG");
	});
});
