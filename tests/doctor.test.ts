import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type FlnDoctorJsonOutput,
	type FlnFailureJson,
	fln,
} from "../src/api/index.js";
import { setCheckToctouTestHook } from "../src/core/fileContent.js";

const cliPath = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));

async function runDoctorSpawn(
	rootDirectory: string,
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["bun", "run", cliPath, "doctor", ...args], {
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
	const input = await mkdtemp(join(tmpdir(), "fln-doctor-cli-"));
	await writeFile(
		join(input, "package.json"),
		JSON.stringify({ name: "doctor-app", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(join(input, ".env"), "SECRET=1\n");
	await writeFile(join(input, "src.ts"), "export const x = 1;\n");

	return input;
}

describe("fln doctor", () => {
	it("prints human preflight summary", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runDoctorSpawn(input, ["--no-ansi"]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("fln doctor — doctor-app");
		expect(stdout).toContain("Config:");
		expect(stdout).toContain("Scan:");
		expect(stdout).toContain("Tokens:");
		expect(stdout).toContain("Sponsor tracking:");
	});

	it("reports sponsor tracking disabled when FLN_NO_SPONSOR=1", async () => {
		const input = await createProject();
		const proc = Bun.spawn(["bun", "run", cliPath, "doctor", "--no-ansi"], {
			cwd: input,
			env: { ...process.env, FLN_NO_SPONSOR: "1" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = (await new Response(proc.stdout).text()).trim();

		expect(await proc.exited).toBe(0);
		expect(stdout).toContain("Sponsor tracking: disabled");
	});

	it("prints JSON with schemaVersion and scan stats", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnDoctorJsonOutput;

		expect(exitCode).toBe(0);
		expect(payload.schemaVersion).toBe(1);
		expect(payload.$schema).toBe("https://fln.nesvet.dev/schema/doctor");
		expect(payload.projectName).toBe("doctor-app");
		expect(payload.scan.filesIncluded).toBeGreaterThan(0);
		expect(payload.scan.filesScanned).toBeGreaterThanOrEqual(
			payload.scan.filesIncluded,
		);
		expect(payload.estimate.tokens).toBeGreaterThan(0);
		expect(payload.estimate.totalBytes).toBeGreaterThan(0);
	});

	it("prints Config (ignored) with --ignore-config", async () => {
		const input = await createProject();
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify({ output: "custom.md" }, null, "\t"),
		);
		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"--ignore-config",
			"--no-ansi",
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Config:");
		expect(stdout).toContain("(ignored)");
	});

	it("exits 1 on invalid config JSON", async () => {
		const input = await createProject();
		await writeFile(join(input, "fln.json"), "{ not-json");
		const { stderr, exitCode } = await runDoctorSpawn(input, [
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stderr) as FlnFailureJson;

		expect(exitCode).toBe(1);
		expect(payload.ok).toBe(false);
		expect(payload.error.code).toBe("INVALID_CONFIG");
	});

	it("exits 2 when no files are included", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"--only",
			"**/*.missing",
			"--no-ansi",
		]);

		expect(exitCode).toBe(2);
		expect(stdout).toContain("0 files included");
	});

	it("warns about security paths when force-included", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"-i",
			".env",
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnDoctorJsonOutput;

		expect(exitCode).toBe(0);
		expect(
			payload.warnings.some((warning) => warning.code === "SECURITY_IN_TREE"),
		).toBe(true);
	});

	it("includes recommend budget in JSON", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"--format",
			"json",
			"--recommend-budget",
			"1",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnDoctorJsonOutput;

		expect(exitCode).toBe(0);
		expect(payload.recommend).toBeDefined();
		expect(payload.recommend?.exclude.length).toBeGreaterThan(0);
		expect(payload.recommend?.omittedCount).toBeGreaterThan(0);
		expect(payload.recommend?.projectedTokens).toBeLessThanOrEqual(1);
	});

	it("warns FILES_CHANGED_DURING_PREFLIGHT when files drift", async () => {
		const input = await createProject();
		setCheckToctouTestHook(async () => true);

		try {
			const report = await fln.doctor({
				input,
				logLevel: "silent",
				ansi: false,
			});

			expect(
				report.warnings.some(
					(warning) => warning.code === "FILES_CHANGED_DURING_PREFLIGHT",
				),
			).toBe(true);
		} finally {
			setCheckToctouTestHook(undefined);
		}
	});

	it("warns when token estimate exceeds --max-tokens", async () => {
		const input = await createProject();
		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"--format",
			"json",
			"--max-tokens",
			"1",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnDoctorJsonOutput;

		expect(exitCode).toBe(0);
		expect(
			payload.warnings.some((warning) => warning.code === "TOKENS_OVER_BUDGET"),
		).toBe(true);
	});

	it("rejects flatten output format md on doctor", async () => {
		const input = await createProject();
		const { stderr, exitCode } = await runDoctorSpawn(input, [
			"--format",
			"md",
			"--no-ansi",
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain("Invalid --format for fln doctor");
		expect(stderr).toContain("text or json");
	});

	it("warns about files over max-size in tree", async () => {
		const input = await createProject();
		await writeFile(join(input, "large.ts"), "x".repeat(200));
		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"--max-file-size",
			"50",
			"--format",
			"json",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as FlnDoctorJsonOutput;

		expect(exitCode).toBe(0);
		expect(
			payload.warnings.some((warning) => warning.code === "FILES_TOO_LARGE"),
		).toBe(true);
	});

	it("reports sponsor tracking enabled via API without CLI flags", async () => {
		const input = await createProject();
		const report = await fln.doctor({ input, logLevel: "silent", ansi: false });

		expect(report.sponsorTracking.enabled).toBe(true);
	});

	it("exits 0 when --since has no changed files", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-doctor-since-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "since", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "app.ts"), "export {};\n");

		execSync("git init", { cwd: input });
		execSync("git config user.email test@test && git config user.name Test", {
			cwd: input,
		});
		execSync("git add -A && git commit -m initial", { cwd: input });

		const { stdout, exitCode } = await runDoctorSpawn(input, [
			"--since",
			"HEAD",
			"--no-ansi",
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("No changed files since HEAD");
	});
});
