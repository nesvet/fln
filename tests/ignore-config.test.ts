import { describe, expect, it } from "bun:test";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FlnDoctorJson } from "../src/api/doctor.js";
import { type FlnError, fln } from "../src/api/index.js";
import { runCommandLine } from "../src/cli/commandLine.js";
import { resolveFileConfigAtInput } from "../src/config/index.js";

const cliEntryPath = fileURLToPath(
	new URL("../src/cli/index.ts", import.meta.url),
);

async function createProjectWithBlockingConfig(): Promise<string> {
	const input = await mkdtemp(join(tmpdir(), "fln-ignore-config-"));
	await writeFile(
		join(input, "package.json"),
		JSON.stringify({ name: "ignore-test", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(join(input, "readme.txt"), "hello\n");
	await writeFile(
		join(input, "fln.json"),
		JSON.stringify(
			{
				exclude: ["**/*"],
				gitignore: false,
			},
			null,
			"\t",
		),
	);

	return input;
}

async function runCliExpectSuccess(
	rootDirectory: string,
	args: string[],
): Promise<void> {
	const previousCwd = process.cwd();
	const previousArgv = [...process.argv];

	try {
		process.chdir(rootDirectory);
		process.argv = [previousArgv[0] ?? "node", cliEntryPath, ...args];
		await runCommandLine();
	} finally {
		process.chdir(previousCwd);
		process.argv = previousArgv;
	}
}

describe("resolveFileConfigAtInput", () => {
	it("does not read fln.json when ignoreConfig is true", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-resolve-ignore-"));
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify(
				{
					exclude: ["**/*.secret"],
				},
				null,
				"\t",
			),
		);

		const resolved = await resolveFileConfigAtInput(input, {
			ignoreConfig: true,
		});

		expect(resolved.loaded).toBe(false);
		expect(resolved.parseError).toBeUndefined();
		expect(resolved.fileConfig.exclude).toBeUndefined();
	});

	it("loads fln.json when ignoreConfig is false", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-resolve-load-"));
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify(
				{
					exclude: ["**/*.secret"],
				},
				null,
				"\t",
			),
		);

		const resolved = await resolveFileConfigAtInput(input);

		expect(resolved.loaded).toBe(true);
		expect(resolved.fileConfig.exclude).toEqual(["**/*.secret"]);
	});
});

describe("ignoreConfig", () => {
	it("API includes files when config excludes everything", async () => {
		const input = await createProjectWithBlockingConfig();

		await expect(
			fln({ input, logLevel: "silent", overwrite: true }),
		).rejects.toMatchObject({
			code: "NO_FILES_INCLUDED",
		} satisfies Partial<FlnError>);

		const result = await fln({
			input,
			ignoreConfig: true,
			logLevel: "silent",
			overwrite: true,
		});
		expect(result.filesIncluded).toBeGreaterThan(0);
	});

	it("API uses default output path instead of config output", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-ignore-output-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "out-test", version: "2.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "readme.txt"), "x\n");
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify({ output: "from-config.md" }, null, "\t"),
		);

		const result = await fln({
			input,
			ignoreConfig: true,
			overwrite: true,
			logLevel: "silent",
		});

		expect(result.outputPath).toContain("output.md");
		expect(result.outputPath).not.toContain("from-config.md");
		await expect(access(join(input, "from-config.md"))).rejects.toThrow();
	});

	it("CLI --ignore-config includes files blocked by config", async () => {
		const input = await createProjectWithBlockingConfig();

		await runCliExpectSuccess(input, [
			"--ignore-config",
			"-o",
			"out.md",
			"--overwrite",
			"--quiet",
			"--no-ansi",
		]);

		const content = await Bun.file(join(input, "out.md")).text();
		expect(content).toContain("readme.txt");
	});

	it("logs Ignoring message at verbose and skips Using config", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-ignore-logs-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "logs", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "readme.txt"), "ok\n");
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify({ output: "out.md", overwrite: true }, null, "\t"),
		);

		const logs: string[] = [];
		const originalInfo = console.info;
		console.info = (message: string) => {
			logs.push(message);
		};

		try {
			await fln({
				input,
				ignoreConfig: true,
				overwrite: true,
				logLevel: "verbose",
			});
		} finally {
			console.info = originalInfo;
		}

		expect(
			logs.some(
				(line) => line.includes("Ignoring") && line.includes("fln.json"),
			),
		).toBe(true);
		expect(logs.some((line) => line.includes("Using config"))).toBe(false);
	});

	it("does not log Using config when ignoreConfig is silent", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-ignore-silent-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "silent", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "readme.txt"), "ok\n");
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify({ overwrite: true }, null, "\t"),
		);

		const logs: string[] = [];
		const originalInfo = console.info;
		console.info = (message: string) => {
			logs.push(message);
		};

		try {
			await fln({
				input,
				ignoreConfig: true,
				overwrite: true,
				logLevel: "silent",
			});
		} finally {
			console.info = originalInfo;
		}

		expect(logs.some((line) => line.includes("Using config"))).toBe(false);
		expect(logs.some((line) => line.includes("Ignoring"))).toBe(false);
	});

	it("doctor succeeds with invalid config when --ignore-config", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-ignore-doctor-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "doc", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "src.ts"), "export {}\n");
		await writeFile(join(input, "fln.json"), "{ not-json");

		const proc = Bun.spawn(
			[
				"bun",
				"run",
				cliEntryPath,
				"doctor",
				"--ignore-config",
				"--format",
				"json",
				"--no-ansi",
			],
			{
				cwd: input,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);
		const payload = JSON.parse(stdout) as FlnDoctorJson;
		expect(payload.config.ignored).toBe(true);
		expect(payload.config.loaded).toBe(false);
	});

	it("doctor text reports (ignored) when config file exists", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-ignore-doctor-text-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "doc-text", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "src.ts"), "export {}\n");
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify({ output: "ignored-out.md" }, null, "\t"),
		);

		const proc = Bun.spawn(
			["bun", "run", cliEntryPath, "doctor", "--ignore-config", "--no-ansi"],
			{
				cwd: input,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const stdout = await new Response(proc.stdout).text();

		expect(await proc.exited).toBe(0);
		expect(stdout).toContain("Config:");
		expect(stdout).toContain("(ignored)");
	});

	it("CLI why --ignore-config changes decision vs config file", async () => {
		const input = await createProjectWithBlockingConfig();

		const withConfigProc = Bun.spawn(
			[
				"bun",
				"run",
				cliEntryPath,
				"why",
				"readme.txt",
				"--format",
				"json",
				"--no-ansi",
			],
			{ cwd: input, stdout: "pipe" },
		);
		const withConfigOut = JSON.parse(
			await new Response(withConfigProc.stdout).text(),
		) as {
			decision: { included: boolean };
		};

		const ignoredProc = Bun.spawn(
			[
				"bun",
				"run",
				cliEntryPath,
				"why",
				"readme.txt",
				"--ignore-config",
				"--format",
				"json",
				"--no-ansi",
			],
			{ cwd: input, stdout: "pipe" },
		);
		const ignoredOut = JSON.parse(
			await new Response(ignoredProc.stdout).text(),
		) as {
			decision: { included: boolean };
		};

		expect(withConfigOut.decision.included).toBe(false);
		expect(ignoredOut.decision.included).toBe(true);
	});

	it("why respects ignoreConfig for exclude patterns from file", async () => {
		const input = await createProjectWithBlockingConfig();

		const withConfig = await fln.explain({
			path: "readme.txt",
			input,
			logLevel: "silent",
			ansi: false,
		});
		const ignored = await fln.explain({
			path: "readme.txt",
			input,
			ignoreConfig: true,
			logLevel: "silent",
			ansi: false,
		});

		expect(withConfig.included).toBe(false);
		expect(ignored.included).toBe(true);
	});
});
