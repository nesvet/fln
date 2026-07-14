import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { fln } from "../src/api/index.js";
import { runCommandLine } from "../src/cli/commandLine.js";

type RuntimeState = {
	cwd: string;
	argv: string[];
};

type BufferEncoding = Parameters<Writable["write"]>[1];

const cliEntryPath = fileURLToPath(
	new URL("../src/cli/index.ts", import.meta.url),
);

async function runCli(rootDirectory: string, args: string[]): Promise<void> {
	const runtimeState: RuntimeState = {
		cwd: process.cwd(),
		argv: [...process.argv],
	};

	try {
		process.chdir(rootDirectory);
		process.argv = [runtimeState.argv[0] ?? "node", cliEntryPath, ...args];
		await runCommandLine();
	} finally {
		process.chdir(runtimeState.cwd);
		process.argv = runtimeState.argv;
	}
}

async function runCliWithStdout(
	rootDirectory: string,
	args: string[],
): Promise<string> {
	const chunks: Buffer[] = [];
	const capture = new Writable({
		write(
			chunk: Buffer | string,
			encoding: BufferEncoding,
			callback: () => void,
		) {
			chunks.push(
				Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
			);
			callback();
		},
	});
	const originalStdout = process.stdout;
	(process as { stdout: Writable }).stdout = capture;

	try {
		await runCli(rootDirectory, args);

		return Buffer.concat(chunks).toString("utf8");
	} finally {
		(process as { stdout: Writable }).stdout = originalStdout;
	}
}

async function createTempProject(
	name: string,
	version: string,
): Promise<string> {
	const rootDirectory = await mkdtemp(join(tmpdir(), "fln-"));
	const packageJson = {
		name,
		version,
	};

	await writeFile(
		join(rootDirectory, "package.json"),
		JSON.stringify(packageJson, null, "\t"),
	);

	return rootDirectory;
}

describe("fln end-to-end", () => {
	it("generates markdown and respects gitignore", async () => {
		const rootDirectory = await createTempProject("fln-test", "1.2.3");
		const srcDirectory = join(rootDirectory, "src");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(srcDirectory, { recursive: true });
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(srcDirectory, "ok.ts"), "export const ok = true;\n");
		await writeFile(join(rootDirectory, "secret.txt"), "secret\n");
		await writeFile(join(rootDirectory, ".gitignore"), "secret.txt\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-test-1.2.3.md");
		const content = await readFile(outputFile, "utf8");

		expect(content).toContain("src/ok.ts");
		expect(content).not.toContain("secret.txt");
	});

	it("adds counter when output file exists", async () => {
		const rootDirectory = await createTempProject("fln-counter", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(
			join(outputDirectory, "fln-counter-1.0.0.md"),
			"existing\n",
		);

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--quiet",
			"--no-ansi",
		]);

		const entries = await readdir(outputDirectory);
		expect(entries).toContain("fln-counter-1.0.0-1.md");
	});

	it("resolves relative --output from cwd instead of input directory", async () => {
		const parentDirectory = await mkdtemp(join(tmpdir(), "fln-cwd-output-"));
		const inputDirectory = join(parentDirectory, "cnvr");
		await mkdir(inputDirectory, { recursive: true });
		await writeFile(
			join(inputDirectory, "package.json"),
			JSON.stringify({ name: "cnvr", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(inputDirectory, "readme.txt"), "ok\n");

		await runCli(parentDirectory, [
			"cnvr",
			"--output",
			"cnvr.md",
			"--quiet",
			"--no-ansi",
		]);

		const outputInCwd = await readFile(
			join(parentDirectory, "cnvr.md"),
			"utf8",
		);
		expect(outputInCwd).toContain("readme.txt");
		await expect(
			readFile(join(inputDirectory, "cnvr.md"), "utf8"),
		).rejects.toThrow();
	});

	it("overwrites output file when --overwrite is set", async () => {
		const rootDirectory = await createTempProject("fln-overwrite", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		const outputFile = join(outputDirectory, "fln-overwrite-1.0.0.md");
		await writeFile(outputFile, "existing\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--overwrite",
			"--quiet",
			"--no-ansi",
		]);

		const entries = await readdir(outputDirectory);
		expect(entries).toContain("fln-overwrite-1.0.0.md");
		expect(entries).not.toContain("fln-overwrite-1.0.0-1.md");

		const content = await readFile(outputFile, "utf8");
		expect(content).not.toBe("existing\n");
	});

	it("does not write output in dry-run", async () => {
		const rootDirectory = await createTempProject("fln-dry", "2.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		const before = await readdir(outputDirectory);

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--dry-run",
			"--quiet",
			"--no-ansi",
		]);

		const after = await readdir(outputDirectory);
		expect(after).toEqual(before);
	});

	it("outputs to stdout when --stdout is set", async () => {
		const rootDirectory = await createTempProject("fln-stdout", "1.0.0");
		await mkdir(join(rootDirectory, "src"), { recursive: true });
		await writeFile(
			join(rootDirectory, "src", "index.ts"),
			"export const x = 1;\n",
		);

		const content = await runCliWithStdout(rootDirectory, [
			"--stdout",
			"--no-ansi",
		]);

		expect(content).not.toContain("<!-- 🥞 fln");
		expect(content).toContain("# Codebase Snapshot");
		expect(content).toContain("src/index.ts");
	});

	it("writes valid json output", async () => {
		const rootDirectory = await createTempProject("fln-json", "3.1.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--format",
			"json",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-json-3.1.0.json");
		const content = await readFile(outputFile, "utf8");
		const parsed = JSON.parse(content) as {
			schemaVersion?: number;
			root?: unknown;
			options?: { tree?: boolean };
			stats?: Record<string, unknown>;
			input?: string;
		};

		expect(parsed.schemaVersion).toBe(2);
		expect(parsed.root).toBeDefined();
		expect(parsed.options?.tree).toBe(true);
		expect(parsed.stats).toBeDefined();
		expect(parsed.stats).not.toHaveProperty("outputSizeBytes");
		expect(parsed.stats).not.toHaveProperty("outputTokenCount");
		expect(parsed.input).toBeDefined();

		const inputPath = parsed.input;
		if (!inputPath) throw new Error("Missing input in json output.");

		const resolvedRoot = await realpath(rootDirectory);
		const resolvedReported = await realpath(inputPath);

		expect(resolvedReported).toBe(resolvedRoot);
	});

	it("uses folder name when version is missing", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-noversion-"));
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, `${basename(rootDirectory)}.md`);
		const content = await readFile(outputFile, "utf8");

		expect(content).toContain("readme.txt");
	});

	it("wraps markdown with triple backticks in quad backticks", async () => {
		const rootDirectory = await createTempProject("fln-fence", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });

		const readmeContent = "# Test\n\n```bash\nnpm install\n```\n";
		await writeFile(join(rootDirectory, "README.md"), readmeContent);

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-fence-1.0.0.md");
		const content = await readFile(outputFile, "utf8");

		expect(content).toContain("```bash");
		expect(content).not.toContain("\\`\\`\\`");

		const lines = content.split("\n");
		const readmeStart = lines.indexOf("### README.md");
		expect(lines[readmeStart + 1]).toBe("````md");

		const closingFence = lines.slice(readmeStart + 2).indexOf("````");
		expect(closingFence).toBeGreaterThan(0);
	});

	it("ends output with single newline", async () => {
		const rootDirectory = await createTempProject("fln-newline", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "test.txt"), "content\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-newline-1.0.0.md");
		const content = await readFile(outputFile, "utf8");

		expect(content.endsWith("\n")).toBe(true);
		expect(content.endsWith("\n\n")).toBe(false);
	});

	it("uses --date in markdown output", async () => {
		const rootDirectory = await createTempProject("fln-date-md", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--date",
			"2026-02-08 12:00",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-date-md-1.0.0.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toContain("Generated: 2026-02-08 12:00");
	});

	it("uses --date in json output", async () => {
		const rootDirectory = await createTempProject("fln-date-json", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--format",
			"json",
			"--date",
			"2026-02-08 12:00",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-date-json-1.0.0.json");
		const content = await readFile(outputFile, "utf8");
		const parsed = JSON.parse(content) as { generated?: string };
		expect(parsed.generated).toBe("2026-02-08 12:00");
	});

	it("throws on invalid --date", async () => {
		const rootDirectory = await createTempProject("fln-date-invalid", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });

		let exitCode: number | undefined;
		const originalExit = process.exit;
		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error(`process.exit(${String(code)})`);
		};

		try {
			await expect(
				runCli(rootDirectory, [
					"--output",
					outputDirectory,
					"--date",
					"not-a-date",
					"--quiet",
					"--no-ansi",
				]),
			).rejects.toThrow(/Invalid date|process\.exit\(1\)/);
		} finally {
			process.exit = originalExit;
		}

		expect(exitCode).toBe(1);
	});

	it("outputs version with --version flag", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-version-"));

		let output = "";
		let exitCode: number | undefined;

		const originalLog = console.info;
		const originalExit = process.exit;

		console.info = (message: string) => {
			output = message;
		};

		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error("EXIT");
		};

		try {
			await runCli(rootDirectory, ["--version", "--no-ansi"]);
		} catch {
			// Expected - process.exit throws in tests
		}

		console.info = originalLog;
		process.exit = originalExit;

		expect(exitCode).toBe(0);
		expect(output).toMatch(/^\d+\.\d+\.\d+(-[\d.A-Za-z]+)?$/);
	});

	it("outputs version with -v flag", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-version-"));

		let output = "";
		let exitCode: number | undefined;

		const originalLog = console.info;
		const originalExit = process.exit;

		console.info = (message: string) => {
			output = message;
		};

		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error("EXIT");
		};

		try {
			await runCli(rootDirectory, ["-v", "--no-ansi"]);
		} catch {
			// Expected - process.exit throws in tests
		}

		console.info = originalLog;
		process.exit = originalExit;

		expect(exitCode).toBe(0);
		expect(output).toMatch(/^\d+\.\d+\.\d+(-[\d.A-Za-z]+)?$/);
	});

	it("creates fln.json with fln init", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-init-"));
		const configPath = join(rootDirectory, "fln.json");
		const mcpPath = join(rootDirectory, ".mcp.json");

		const originalExit = process.exit;
		process.exit = () => {
			throw new Error("EXIT");
		};

		try {
			await runCli(rootDirectory, ["init", "--no-ansi"]);
		} catch {
			// Expected - process.exit throws in tests
		}

		process.exit = originalExit;

		const content = await readFile(configPath, "utf8");
		const config = JSON.parse(content) as { output?: string; format?: string };
		expect(config.output).toBe("output.md");
		expect(config.format).toBe("md");

		const mcpContent = await readFile(mcpPath, "utf8");
		const mcpConfig = JSON.parse(mcpContent) as {
			mcpServers?: { fln?: { command?: string; args?: string[] } };
		};
		expect(mcpConfig.mcpServers?.fln?.command).toBe("fln");
		expect(mcpConfig.mcpServers?.fln?.args).toEqual(["mcp"]);
	});

	it("refuses to overwrite existing fln.json without --overwrite", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-init-exists-"));
		const configPath = join(rootDirectory, "fln.json");
		await writeFile(
			configPath,
			JSON.stringify({ output: "custom.md" }, null, "\t"),
		);

		const projectRoot = join(import.meta.dir, "..");
		const cliPath = join(projectRoot, "src", "cli", "index.ts");
		const proc = Bun.spawn(["bun", "run", cliPath, "init", "--no-ansi"], {
			cwd: rootDirectory,
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;

		expect(proc.exitCode).toBe(1);
		const content = await readFile(configPath, "utf8");
		expect(JSON.parse(content) as { output?: string }).toMatchObject({
			output: "custom.md",
		});
	});

	it("overwrites fln.json with fln init --overwrite", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-init-overwrite-"));
		const configPath = join(rootDirectory, "fln.json");
		await writeFile(
			configPath,
			JSON.stringify({ output: "old.md" }, null, "\t"),
		);

		const originalExit = process.exit;
		process.exit = () => {
			throw new Error("EXIT");
		};

		try {
			await runCli(rootDirectory, ["init", "--overwrite", "--no-ansi"]);
		} catch {
			// Expected
		}

		process.exit = originalExit;

		const content = await readFile(configPath, "utf8");
		const config = JSON.parse(content) as { output?: string };
		expect(config.output).toBe("output.md");
	});

	it("includes only specified extensions with --ext", async () => {
		const rootDirectory = await createTempProject("fln-ext", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(join(rootDirectory, "src"), { recursive: true });
		await writeFile(
			join(rootDirectory, "src", "index.ts"),
			"export const x = 1;\n",
		);
		await writeFile(
			join(rootDirectory, "src", "utils.js"),
			"module.exports = {};\n",
		);
		await writeFile(join(rootDirectory, "src", "styles.css"), "body {}\n");
		await writeFile(join(rootDirectory, "README.md"), "# Readme\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--ext",
			"ts,js",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-ext-1.0.0.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toContain("src/index.ts");
		expect(content).toContain("src/utils.js");
		expect(content).not.toContain("styles.css");
		expect(content).not.toContain("README.md");
	});

	it("includes only files changed since git ref with --since", async () => {
		const rootDirectory = await createTempProject("fln-since", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(join(rootDirectory, "src"), { recursive: true });
		await writeFile(join(rootDirectory, "src", "a.ts"), "const a = 1;\n");
		await writeFile(join(rootDirectory, "src", "b.ts"), "const b = 2;\n");

		execSync("git init", { cwd: rootDirectory });
		execSync("git config user.email test@test && git config user.name Test", {
			cwd: rootDirectory,
		});
		execSync("git add -A && git commit -m initial", { cwd: rootDirectory });

		await writeFile(join(rootDirectory, "src", "b.ts"), "const b = 3;\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--since",
			"HEAD",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-since-1.0.0.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toContain("src/b.ts");
		expect(content).not.toContain("src/a.ts");
	});

	it("exits early with message when --since has no changed files", async () => {
		const rootDirectory = await createTempProject("fln-since-empty", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(join(rootDirectory, "src"), { recursive: true });
		await writeFile(join(rootDirectory, "src", "a.ts"), "const a = 1;\n");

		execSync("git init", { cwd: rootDirectory });
		execSync("git config user.email test@test && git config user.name Test", {
			cwd: rootDirectory,
		});
		execSync("git add -A && git commit -m initial", { cwd: rootDirectory });
		execSync("git add -A && git commit -m second --allow-empty", {
			cwd: rootDirectory,
		});

		const originalExit = process.exit;
		const originalInfo = console.info;
		let exitCode: number | undefined;
		let infoMessage = "";
		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error("EXIT");
		};
		console.info = (...args: unknown[]) => {
			infoMessage = args.map(String).join(" ");
		};

		try {
			await runCli(rootDirectory, [
				"--output",
				outputDirectory,
				"--since",
				"HEAD~1",
				"--quiet",
				"--no-ansi",
			]);
		} catch (error) {
			if ((error as Error).message !== "EXIT") throw error;
		} finally {
			process.exit = originalExit;
			console.info = originalInfo;
		}

		expect(exitCode).toBe(0);
		expect(infoMessage).toContain("No changed files since HEAD~1");
	});

	it("intersects --since and --ext when both are used", async () => {
		const rootDirectory = await createTempProject("fln-since-ext", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(join(rootDirectory, "src"), { recursive: true });
		await writeFile(join(rootDirectory, "src", "a.ts"), "const a = 1;\n");
		await writeFile(join(rootDirectory, "src", "b.js"), "const b = 2;\n");
		await writeFile(join(rootDirectory, "src", "c.md"), "# c\n");

		execSync("git init", { cwd: rootDirectory });
		execSync("git config user.email test@test && git config user.name Test", {
			cwd: rootDirectory,
		});
		execSync("git add -A && git commit -m initial", { cwd: rootDirectory });

		await writeFile(join(rootDirectory, "src", "a.ts"), "const a = 2;\n");
		await writeFile(join(rootDirectory, "src", "b.js"), "const b = 3;\n");
		await writeFile(join(rootDirectory, "src", "c.md"), "# c updated\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--since",
			"HEAD",
			"--ext",
			"ts",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-since-ext-1.0.0.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toContain("src/a.ts");
		expect(content).not.toContain("src/b.js");
		expect(content).not.toContain("src/c.md");
	});

	it("exits early when --since and --ext have empty intersection", async () => {
		const rootDirectory = await createTempProject(
			"fln-since-ext-empty",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(join(rootDirectory, "src"), { recursive: true });
		await writeFile(join(rootDirectory, "src", "a.ts"), "const a = 1;\n");

		execSync("git init", { cwd: rootDirectory });
		execSync("git config user.email test@test && git config user.name Test", {
			cwd: rootDirectory,
		});
		execSync("git add -A && git commit -m initial", { cwd: rootDirectory });

		await writeFile(join(rootDirectory, "src", "a.ts"), "const a = 2;\n");

		const originalExit = process.exit;
		const originalInfo = console.info;
		let exitCode: number | undefined;
		let infoMessage = "";
		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error("EXIT");
		};
		console.info = (...args: unknown[]) => {
			infoMessage = args.map(String).join(" ");
		};

		try {
			await runCli(rootDirectory, [
				"--output",
				outputDirectory,
				"--since",
				"HEAD",
				"--ext",
				"css",
				"--quiet",
				"--no-ansi",
			]);
		} catch (error) {
			if ((error as Error).message !== "EXIT") throw error;
		} finally {
			process.exit = originalExit;
			console.info = originalInfo;
		}

		expect(exitCode).toBe(0);
		expect(infoMessage).toContain("No changed files since HEAD");
		expect(infoMessage).toContain("matching --ext css");
	});

	it("applies exclude from fln.json", async () => {
		const rootDirectory = await createTempProject(
			"fln-config-exclude",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "include.ts"), "export const x = 1;\n");
		await writeFile(join(rootDirectory, "exclude.me"), "excluded\n");

		const config = {
			output: join(outputDirectory, "fln-config-exclude-1.0.0.md"),
			overwrite: true,
			exclude: ["**/*.me"],
		};
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(config, null, "\t"),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const content = await readFile(
			join(outputDirectory, "fln-config-exclude-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("include.ts");
		expect(content).not.toContain("exclude.me");
	});

	it("excludes directory with ./ prefix in exclude", async () => {
		const rootDirectory = await createTempProject("fln-exclude-dir", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const projectsDir = join(rootDirectory, "projects-full");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(projectsDir, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(projectsDir, "file.txt"), "excluded\n");

		const config = {
			output: "out/fln-exclude-dir-1.0.0.md",
			overwrite: true,
			exclude: ["./projects-full"],
		};
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(config, null, "\t"),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const content = await readFile(
			join(outputDirectory, "fln-exclude-dir-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("readme.txt");
		expect(content).not.toContain("projects-full");
		expect(content).not.toContain("excluded");
	});

	it("excludes directory with my-project/folder pattern", async () => {
		const rootDirectory = await createTempProject(
			"fln-exclude-canonical",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");
		const myProjectDir = join(rootDirectory, "my-project");
		const folderDir = join(myProjectDir, "folder");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(folderDir, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(folderDir, "secret.txt"), "excluded\n");

		const config = {
			output: "out/fln-exclude-canonical-1.0.0.md",
			overwrite: true,
			exclude: ["my-project/folder"],
		};
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(config, null, "\t"),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const content = await readFile(
			join(outputDirectory, "fln-exclude-canonical-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("readme.txt");
		expect(content).not.toContain("my-project/folder");
		expect(content).not.toContain("secret.txt");
	});

	it("does not exclude my-project/folder when pattern is ../my-project/folder (resolves outside input)", async () => {
		const rootDirectory = await createTempProject(
			"fln-exclude-parent",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");
		const myProjectDir = join(rootDirectory, "my-project");
		const folderDir = join(myProjectDir, "folder");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(folderDir, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(folderDir, "secret.txt"), "content\n");

		const config = {
			output: "out/fln-exclude-parent-1.0.0.md",
			overwrite: true,
			exclude: ["../my-project/folder"],
		};
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(config, null, "\t"),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const content = await readFile(
			join(outputDirectory, "fln-exclude-parent-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("my-project/folder");
		expect(content).toContain("content");
	});

	it("force includes file excluded by .gitignore via include", async () => {
		const rootDirectory = await createTempProject("fln-include-force", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(
			join(rootDirectory, "ignored.local.ts"),
			"export const local = 1;\n",
		);
		await writeFile(join(rootDirectory, ".gitignore"), "*.local.ts\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--include",
			"ignored.local.ts",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-include-force-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("readme.txt");
		expect(content).toContain("ignored.local.ts");
		expect(content).toContain("export const local = 1");
	});

	it("unignores gitignored file via exclude negation without --only", async () => {
		const rootDirectory = await createTempProject("fln-unignore-e2e", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(
			join(rootDirectory, "ignored.local.ts"),
			"export const local = 1;\n",
		);
		await writeFile(join(rootDirectory, ".gitignore"), "*.local.ts\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--exclude",
			"!ignored.local.ts",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-unignore-e2e-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("readme.txt");
		expect(content).toContain("ignored.local.ts");
	});

	it("whitelist mode via --only includes matching files only", async () => {
		const rootDirectory = await createTempProject("fln-only-mode", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(rootDirectory, "only.ts"), "export const only = 1;\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--only",
			"only.ts",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-only-mode-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("only.ts");
		expect(content).not.toContain("readme.txt");
	});

	it("force-includes dotfile without --include-hidden", async () => {
		const rootDirectory = await createTempProject("fln-dot-force", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(
			join(rootDirectory, "package.json"),
			JSON.stringify({ name: "dot", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(rootDirectory, ".flnrc"), "option=value\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--include",
			".flnrc",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "dot-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain(".flnrc");
	});

	it("accepts include with ./ prefix", async () => {
		const rootDirectory = await createTempProject("fln-include-dot", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const srcDir = join(rootDirectory, "src");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(srcDir, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "root\n");
		await writeFile(join(srcDir, "index.ts"), "export const x = 1;\n");
		await writeFile(join(rootDirectory, ".gitignore"), "src/*.ts\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--include",
			"./src/index.ts",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-include-dot-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("src/index.ts");
	});

	it("force includes directory excluded by .gitignore via includePattern src/", async () => {
		const rootDirectory = await createTempProject("fln-include-dir", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const srcDir = join(rootDirectory, "src");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(srcDir, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "root\n");
		await writeFile(join(srcDir, "lib.ts"), "export const x = 1;\n");
		await writeFile(join(rootDirectory, ".gitignore"), "src/\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--include",
			"src/",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-include-dir-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("src/");
		expect(content).toContain("lib.ts");
	});

	it("follows symlinks to directories with --follow-symlinks", async () => {
		const rootDirectory = await createTempProject("fln-symlink", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const srcDir = join(rootDirectory, "src");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(srcDir, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "root\n");
		await writeFile(join(srcDir, "index.ts"), "export const x = 1;\n");
		await symlink("src", join(rootDirectory, "linked"), "dir");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--follow-symlinks",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-symlink-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("index.ts");
		expect(content).not.toContain("../");
	});

	it("excludes with negation pattern", async () => {
		const rootDirectory = await createTempProject(
			"fln-exclude-negation",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(rootDirectory, "debug.log"), "log\n");
		await writeFile(join(rootDirectory, "important.log"), "important\n");

		const config = {
			output: "out/fln-exclude-negation-1.0.0.md",
			overwrite: true,
			exclude: ["*.log", "!important.log"],
		};
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(config, null, "\t"),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const content = await readFile(
			join(outputDirectory, "fln-exclude-negation-1.0.0.md"),
			"utf8",
		);
		expect(content).not.toContain("debug.log");
		expect(content).toContain("important.log");
	});

	it("excludes multiple extensions with separate patterns", async () => {
		const rootDirectory = await createTempProject("fln-exclude-multi", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(rootDirectory, "temp.log"), "log\n");
		await writeFile(join(rootDirectory, "cache.tmp"), "tmp\n");
		await writeFile(join(rootDirectory, "data.txt"), "data\n");

		const config = {
			output: "out/fln-exclude-multi-1.0.0.md",
			overwrite: true,
			exclude: ["*.log", "*.tmp"],
		};
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(config, null, "\t"),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const content = await readFile(
			join(outputDirectory, "fln-exclude-multi-1.0.0.md"),
			"utf8",
		);
		expect(content).not.toContain("temp.log");
		expect(content).not.toContain("cache.tmp");
		expect(content).toContain("data.txt");
	});

	it("resolves output from fln.json relative to input", async () => {
		const rootDirectory = await createTempProject("fln-config-output", "1.0.0");
		const outputDirectory = join(rootDirectory, "custom-out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");

		const config = {
			output: "custom-out/snapshot.md",
			overwrite: true,
		};
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(config, null, "\t"),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const content = await readFile(
			join(rootDirectory, "custom-out", "snapshot.md"),
			"utf8",
		);
		expect(content).toContain("readme.txt");
	});

	it("errors on invalid JSON in fln.json", async () => {
		const rootDirectory = await createTempProject(
			"fln-config-invalid",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(rootDirectory, "fln.json"), "{ invalid json");

		const proc = Bun.spawn(
			[
				"bun",
				"run",
				cliEntryPath,
				"--output",
				outputDirectory,
				"--quiet",
				"--no-ansi",
			],
			{ cwd: rootDirectory, stdout: "pipe", stderr: "pipe" },
		);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(1);
		expect(stderr).toContain("INVALID_CONFIG");
		expect(stderr).toContain("fln.json");
	});

	it("accepts input and output in API", async () => {
		const input = await createTempProject("fln-api-paths", "1.0.0");
		const outputDirectory = join(input, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(input, "readme.txt"), "ok\n");

		const result = await fln({
			input,
			output: join(outputDirectory, "snapshot.md"),
			overwrite: true,
			logLevel: "silent",
		});

		expect(result.filesIncluded).toBeGreaterThan(0);
		expect(result.outputPath).toContain("snapshot.md");
	});

	it("resolves relative API output from input directory", async () => {
		const input = await createTempProject("fln-api-relative-output", "1.0.0");
		await writeFile(join(input, "readme.txt"), "ok\n");

		const result = await fln({
			input,
			output: "relative.md",
			overwrite: true,
			logLevel: "silent",
		});

		expect(result.outputPath).toBe(join(input, "relative.md"));
		const content = await readFile(join(input, "relative.md"), "utf8");
		expect(content).toContain("readme.txt");
	});

	it("accepts maxFileSize string in fln.json", async () => {
		const input = await createTempProject("fln-config-size", "1.0.0");
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(join(input, "readme.txt"), "ok\n");
		await writeFile(
			join(input, "fln.json"),
			JSON.stringify(
				{
					output: "out/sized.md",
					overwrite: true,
					maxFileSize: "5mb",
					gitignore: true,
				},
				null,
				"\t",
			),
		);

		await runCli(input, ["--quiet", "--no-ansi"]);

		const content = await readFile(join(input, "out", "sized.md"), "utf8");
		expect(content).toContain("readme.txt");
	});

	it("prepends bannerFile content at the beginning and excludes it from tree", async () => {
		const rootDirectory = await createTempProject("fln-banner-file", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const docsDirectory = join(rootDirectory, "docs");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(docsDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(
			join(docsDirectory, "banner.md"),
			"# Project Overview\n\nThis is the banner.\n",
		);

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--banner-file",
			"docs/banner.md",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-banner-file-1.0.0.md");
		const content = await readFile(outputFile, "utf8");

		expect(content).toContain("# Project Overview");
		expect(content).toContain("This is the banner.");
		expect(content).not.toContain("### docs/banner.md");
		expect(content).toContain("### readme.txt");
	});

	it("appends footerFile content at the end and excludes it from tree", async () => {
		const rootDirectory = await createTempProject("fln-footer-file", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const docsDirectory = join(rootDirectory, "docs");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(docsDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(
			join(docsDirectory, "footer.md"),
			"---\n*End of snapshot*\n",
		);

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--footer-file",
			"docs/footer.md",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-footer-file-1.0.0.md");
		const content = await readFile(outputFile, "utf8");

		expect(content).toContain("*End of snapshot*");
		expect(content).not.toContain("### docs/footer.md");
		expect(content).toContain("### readme.txt");
	});

	it("reads bannerFile from fln.json", async () => {
		const rootDirectory = await createTempProject("fln-config-banner", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const docsDirectory = join(rootDirectory, "docs");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(docsDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(docsDirectory, "intro.md"), "Config-driven banner.\n");
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify(
				{
					output: "out/fln-config-banner-1.0.0.md",
					overwrite: true,
					bannerFile: "docs/intro.md",
				},
				null,
				"\t",
			),
		);

		await runCli(rootDirectory, ["--quiet", "--no-ansi"]);

		const outputFile = join(outputDirectory, "fln-config-banner-1.0.0.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toContain("Config-driven banner.");
		expect(content).not.toContain("### docs/intro.md");
	});

	it("throws when bannerFile does not exist", async () => {
		const rootDirectory = await createTempProject(
			"fln-banner-missing",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");

		let exitCode: number | undefined;
		const originalExit = process.exit;
		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error(`process.exit(${String(code)})`);
		};

		try {
			await expect(
				runCli(rootDirectory, [
					"--output",
					outputDirectory,
					"--banner-file",
					"docs/nonexistent.md",
					"--quiet",
					"--no-ansi",
				]),
			).rejects.toThrow();
		} finally {
			process.exit = originalExit;
		}

		expect(exitCode).toBe(1);
	});

	it("outputs both banner and bannerFile with empty line between them", async () => {
		const rootDirectory = await createTempProject("fln-banner-both", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		const docsDirectory = join(rootDirectory, "docs");

		await mkdir(outputDirectory, { recursive: true });
		await mkdir(docsDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(join(docsDirectory, "intro.md"), "File content here.\n");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--banner",
			"Inline banner text.",
			"--banner-file",
			"docs/intro.md",
			"--quiet",
			"--no-ansi",
		]);

		const outputFile = join(outputDirectory, "fln-banner-both-1.0.0.md");
		const content = await readFile(outputFile, "utf8");

		expect(content).toContain("Inline banner text.");
		expect(content).toContain("File content here.");
		expect(content).toContain("Inline banner text.\n\nFile content here.");
	});

	it("outputs Using config message when fln.json is present", async () => {
		const rootDirectory = await createTempProject("fln-config-msg", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		await writeFile(
			join(rootDirectory, "fln.json"),
			JSON.stringify({ output: "out/out.md", overwrite: true }, null, "\t"),
		);

		const logs: string[] = [];
		const originalLog = console.info;
		console.info = (message: string) => {
			logs.push(message);
		};

		try {
			await runCli(rootDirectory, ["--output", outputDirectory, "--no-ansi"]);
		} finally {
			console.info = originalLog;
		}

		expect(
			logs.some(
				(line) => line.includes("Using config") && line.includes("fln.json"),
			),
		).toBe(true);
	});

	it("exits when --since has no changes under input subdirectory", async () => {
		const parentDirectory = await mkdtemp(join(tmpdir(), "fln-since-subdir-"));
		const inputDirectory = join(parentDirectory, "pkg");
		const outputDirectory = join(parentDirectory, "out");

		await mkdir(inputDirectory, { recursive: true });
		await mkdir(outputDirectory, { recursive: true });
		await mkdir(join(parentDirectory, "other"), { recursive: true });
		await writeFile(
			join(inputDirectory, "package.json"),
			JSON.stringify({ name: "pkg", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(inputDirectory, "readme.txt"), "ok\n");

		execSync("git init", { cwd: parentDirectory });
		execSync("git config user.email test@test && git config user.name Test", {
			cwd: parentDirectory,
		});
		execSync("git add -A && git commit -m initial", { cwd: parentDirectory });

		await writeFile(join(parentDirectory, "other", "changed.txt"), "changed\n");

		const originalExit = process.exit;
		const originalInfo = console.info;
		let exitCode: number | undefined;
		let infoMessage = "";
		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error("EXIT");
		};
		console.info = (...args: unknown[]) => {
			infoMessage = args.map(String).join(" ");
		};

		try {
			await runCli(parentDirectory, [
				"pkg",
				"--output",
				outputDirectory,
				"--since",
				"HEAD",
				"--quiet",
				"--no-ansi",
			]);
		} catch (error) {
			if ((error as Error).message !== "EXIT") throw error;
		} finally {
			process.exit = originalExit;
			console.info = originalInfo;
		}

		expect(exitCode).toBe(0);
		expect(infoMessage).toContain("No changed files since HEAD");

		const entries = await readdir(outputDirectory);
		expect(entries).toHaveLength(0);
	});

	it("shows included and scanned file counts in markdown header when files are skipped", async () => {
		const rootDirectory = await createTempProject("fln-stats-header", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "small.txt"), "ok\n");
		await writeFile(join(rootDirectory, "large.bin"), Buffer.alloc(200));

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--max-file-size",
			"50b",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-stats-header-1.0.0.md"),
			"utf8",
		);
		expect(content).toMatch(/Files: \d+ \(\d+ scanned\)/);
		const headerMatch = content.match(/Files: (\d+) \((\d+) scanned\)/);
		expect(headerMatch).not.toBeNull();
		expect(Number(headerMatch?.[1])).toBeLessThan(Number(headerMatch?.[2]));
		expect(content).toContain("### small.txt");
	});

	it("gracefully omits files when --max-total-size is exceeded", async () => {
		const rootDirectory = await createTempProject("fln-max-total", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "a.txt"), "aaaa\n");
		await writeFile(join(rootDirectory, "b.txt"), "bbbb\n");

		const outputFile = join(outputDirectory, "fln-max-total-1.0.0.md");

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--max-total-size",
			"80b",
			"--no-tree",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(outputFile, "utf8");
		expect(content).toContain("Omitted");
	});

	it("removes partial output when --max-total-size exceeded with --strict-limits", async () => {
		const rootDirectory = await createTempProject(
			"fln-max-total-strict",
			"1.0.0",
		);
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "a.txt"), "aaaa\n");
		await writeFile(join(rootDirectory, "b.txt"), "bbbb\n");

		const outputFile = join(outputDirectory, "fln-max-total-strict-1.0.0.md");

		let exitCode: number | undefined;
		const originalExit = process.exit;
		process.exit = (code?: number) => {
			exitCode = code ?? 0;

			throw new Error(`process.exit(${String(code)})`);
		};

		try {
			await expect(
				runCli(rootDirectory, [
					"--output",
					outputDirectory,
					"--max-total-size",
					"80b",
					"--strict-limits",
					"--quiet",
					"--no-ansi",
				]),
			).rejects.toThrow(/\[LIMIT_EXCEEDED]|exceed maximum|process\.exit\(3\)/);
		} finally {
			process.exit = originalExit;
		}

		expect(exitCode).toBe(3);
		await expect(readFile(outputFile, "utf8")).rejects.toThrow();
	});

	it("stops adding files when --max-tokens is reached", async () => {
		const rootDirectory = await createTempProject("fln-max-tokens", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");

		await mkdir(outputDirectory, { recursive: true });
		await writeFile(
			join(rootDirectory, "first.txt"),
			"one two three four five six seven eight\n",
		);
		await writeFile(
			join(rootDirectory, "second.txt"),
			"alpha beta gamma delta epsilon zeta eta theta\n",
		);

		await runCli(rootDirectory, [
			"--output",
			outputDirectory,
			"--max-tokens",
			"60",
			"--no-tree",
			"--quiet",
			"--no-ansi",
		]);

		const content = await readFile(
			join(outputDirectory, "fln-max-tokens-1.0.0.md"),
			"utf8",
		);
		expect(content).toContain("### package.json");
		expect(content).not.toContain("### second.txt");
	});
});
