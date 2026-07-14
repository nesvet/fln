import { describe, expect, it } from "bun:test";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type FlnFailureJson, type FlnWhyJson, fln } from "../src/api/index.js";

const cliPath = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));

async function runWhySpawn(
	rootDirectory: string,
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["bun", "run", cliPath, "why", ...args], {
		cwd: rootDirectory,
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

async function createProject(): Promise<string> {
	const input = await mkdtemp(join(tmpdir(), "fln-why-cli-"));
	await writeFile(
		join(input, "package.json"),
		JSON.stringify({ name: "why", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(join(input, ".env"), "SECRET=1\n");
	await writeFile(join(input, "app.go"), "package main\n");

	return input;
}

describe("fln why", () => {
	it("prints text decision for excluded .env", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runWhySpawn(input, [
			".env",
			"--no-ansi",
		]);

		expect(exitCode).toBe(1);
		expect(stdout).toContain("defaultIgnore");
		expect(stdout).toContain(".env");
	});

	it("prints JSON with schemaVersion and absolute input", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runWhySpawn(input, [
			".env",
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnWhyJson;

		expect(exitCode).toBe(1);
		expect(payload.schemaVersion).toBe(1);
		expect(payload.input).toBe(await realpath(input));
		expect(payload.decision.reason).toBe("defaultIgnore");
	});

	it("reports security when force-included", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runWhySpawn(input, [
			".env",
			"-i",
			".env",
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnWhyJson;

		expect(exitCode).toBe(0);
		expect(payload.decision.included).toBe(true);
		expect(payload.decision.reason).toBe("security");
	});

	it("reports onlyWhitelist for paths outside --only", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runWhySpawn(input, [
			"app.go",
			"--only",
			"**/*.md",
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnWhyJson;

		expect(exitCode).toBe(1);
		expect(payload.decision.reason).toBe("onlyWhitelist");
	});

	it("returns FlnFailureJson on stderr when path is missing", async () => {
		const input = await createProject();
		const { stderr, exitCode } = await runWhySpawn(input, [
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stderr) as FlnFailureJson;

		expect(exitCode).toBe(1);
		expect(payload.ok).toBe(false);
		expect(payload.error.code).toBe("INVALID_CONFIG");
	});

	it("rejects flatten output format md on why", async () => {
		const input = await createProject();
		const { stderr, exitCode } = await runWhySpawn(input, [
			".env",
			"--format",
			"md",
			"--no-ansi",
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain("Invalid --format for fln why");
		expect(stderr).toContain("text or json");
	});
});

describe("fln.explain API", () => {
	it("reports security for .env when force-included", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-why-api-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "why", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".env"), "SECRET=1\n");

		const decision = await fln.explain({
			path: ".env",
			input,
			include: [".env"],
			logLevel: "silent",
		});

		expect(decision.included).toBe(true);
		expect(decision.reason).toBe("security");
	});
});
