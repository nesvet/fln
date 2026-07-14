import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fln } from "../src/api/index.js";

async function createStdinProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "fln-stdin-"));
	await writeFile(
		join(dir, "package.json"),
		JSON.stringify({ name: "stdin-test", version: "1.0.0" }),
	);
	await mkdir(join(dir, "src"), { recursive: true });
	await writeFile(join(dir, "src", "a.ts"), "export const a = 1;\n");
	await writeFile(join(dir, "src", "b.ts"), "export const b = 2;\n");
	await writeFile(join(dir, "src", "c.ts"), "export const c = 3;\n");
	await writeFile(join(dir, "README.md"), "# stdin test\n");
	await writeFile(join(dir, ".gitignore"), "src/b.ts\nsecret.env\n");
	await writeFile(
		join(dir, "secret.env"),
		"AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n",
	);

	return dir;
}

function collectPaths(
	node: {
		path: string;
		type: string;
		skipReason?: string;
		children?: unknown[];
	},
	acc: string[] = [],
): string[] {
	if (node.type === "file") acc.push(node.path);
	for (const child of (node.children ?? []) as (typeof node)[])
		collectPaths(child, acc);

	return acc;
}

describe("fln --stdin (API)", () => {
	it("includes only piped paths (prunes to set)", async () => {
		const input = await createStdinProject();

		const result = await fln.inspect({
			input,
			stdinPaths: ["src/a.ts", "src/c.ts"],
		});

		const paths = collectPaths(result.root);
		expect(paths).toContain("src/a.ts");
		expect(paths).toContain("src/c.ts");
		expect(paths).not.toContain("src/b.ts");
		expect(paths).not.toContain("README.md");
		expect(result.stats.filesIncluded).toBe(2);
	});

	it("bypasses gitignore for piped paths (force-include)", async () => {
		const input = await createStdinProject();

		const result = await fln.inspect({ input, stdinPaths: ["src/b.ts"] });

		const paths = collectPaths(result.root);
		expect(paths).toContain("src/b.ts");
		expect(result.stats.filesIncluded).toBe(1);
	});

	it("keeps security-skipped file in tree but does not count it as included", async () => {
		const input = await createStdinProject();

		const result = await fln.inspect({
			input,
			stdinPaths: ["secret.env", "src/a.ts"],
		});

		const paths = collectPaths(result.root);
		expect(paths).toContain("secret.env");
		expect(paths).toContain("src/a.ts");
		expect(result.stats.filesIncluded).toBe(1);
	});

	it("does not embed content of a security-skipped piped file", async () => {
		const input = await createStdinProject();
		const outputPath = join(input, "out.json");

		await fln({
			input,
			stdinPaths: ["secret.env", "src/a.ts"],
			output: outputPath,
			overwrite: true,
			format: "json",
			logLevel: "silent",
		});

		const { readFile } = await import("node:fs/promises");
		const doc = JSON.parse(await readFile(outputPath, "utf8")) as {
			files: Array<{ path: string; content: string | null }>;
			root: { children: unknown[] };
		};
		const fileEntry = doc.files.find((f) => f.path === "secret.env");
		expect(fileEntry).toBeUndefined();
		const aEntry = doc.files.find((f) => f.path === "src/a.ts");
		expect(aEntry).toBeDefined();
		expect(aEntry?.content).toContain("export const a = 1");
	});

	it("drops piped paths that resolve outside input (traversal safety)", async () => {
		const input = await createStdinProject();

		const result = await fln.inspect({
			input,
			stdinPaths: ["../outside.ts", "src/a.ts"],
		});

		const paths = collectPaths(result.root);
		expect(paths).toContain("src/a.ts");
		expect(paths).not.toContain("../outside.ts");
		expect(result.stats.filesIncluded).toBe(1);
	});

	it("throws NO_FILES_INCLUDED when no piped path matches", async () => {
		const input = await createStdinProject();

		await expect(
			fln.inspect({ input, stdinPaths: ["nonexistent.ts"] }),
		).rejects.toThrow(/No files included/);
	});

	it("throws NO_FILES_INCLUDED when the only piped file is security-skipped", async () => {
		const input = await createStdinProject();

		await expect(
			fln.inspect({ input, stdinPaths: ["secret.env"] }),
		).rejects.toThrow(/No files included/);
	});

	it("fln.plan respects stdinPaths", async () => {
		const input = await createStdinProject();

		const planResult = await fln.plan({
			input,
			stdinPaths: ["src/a.ts", "src/c.ts"],
			budget: 0,
		});

		const paths = planResult.files.map((f) => f.path);
		expect(paths).toContain("src/a.ts");
		expect(paths).toContain("src/c.ts");
		expect(paths).not.toContain("src/b.ts");
	});
});

describe("fln --stdin (CLI spawn)", () => {
	const cliPath = fileURLToPath(
		new URL("../src/cli/index.ts", import.meta.url),
	);

	async function runStdinSpawn(
		input: string,
		fileList: string,
		args: string[],
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		const proc = Bun.spawn(["bun", "run", cliPath, ...args], {
			cwd: input,
			stdin: new Blob([fileList]),
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

	it("flattens only piped paths via --stdin --stdout", async () => {
		const input = await createStdinProject();
		const { stdout, exitCode } = await runStdinSpawn(
			input,
			"src/a.ts\nsrc/c.ts\n",
			["--stdin", "--stdout", "--no-ansi"],
		);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("src/a.ts");
		expect(stdout).toContain("src/c.ts");
		expect(stdout).not.toContain("export const b = 2");
	});

	it("bypasses gitignore for piped path via CLI --stdin", async () => {
		const input = await createStdinProject();
		const { stdout, exitCode } = await runStdinSpawn(input, "src/b.ts\n", [
			"--stdin",
			"--stdout",
			"--no-ansi",
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("export const b = 2");
	});

	it("fln plan --stdin --format json emits only piped paths", async () => {
		const input = await createStdinProject();
		const { stdout, exitCode } = await runStdinSpawn(input, "src/a.ts\n", [
			"plan",
			"--stdin",
			"--format",
			"json",
			"--stdout",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as { files: Array<{ path: string }> };

		expect(exitCode).toBe(0);
		const paths = payload.files.map((f) => f.path);
		expect(paths).toContain("src/a.ts");
		expect(paths).not.toContain("src/b.ts");
	});
});
