import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "bun:test";
import { runCommandLine } from "../src/cli/commandLine";


type RuntimeState = {
	cwd: string;
	argv: string[];
};

async function runCli(rootDirectory: string, args: string[]): Promise<void> {
	const runtimeState: RuntimeState = {
		cwd: process.cwd(),
		argv: [ ...process.argv ]
	};
	
	try {
		process.chdir(rootDirectory);
		process.argv = [ runtimeState.argv[0] ?? "node", "flatr", ...args ];
		await runCommandLine();
	} finally {
		process.chdir(runtimeState.cwd);
		process.argv = runtimeState.argv;
	}
}

async function createTempProject(name: string, version: string): Promise<string> {
	const rootDirectory = await mkdtemp(join(tmpdir(), "flatr-"));
	const packageJson = {
		name,
		version
	};
	
	await writeFile(join(rootDirectory, "package.json"), JSON.stringify(packageJson, null, "\t"));
	
	return rootDirectory;
}

describe("flatr end-to-end", () => {
	it("generates markdown and respects gitignore", async () => {
		const rootDirectory = await createTempProject("flatr-test", "1.2.3");
		const srcDirectory = join(rootDirectory, "src");
		const outputDirectory = join(rootDirectory, "out");
		
		await mkdir(srcDirectory, { recursive: true });
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(srcDirectory, "ok.ts"), "export const ok = true;\n");
		await writeFile(join(rootDirectory, "secret.txt"), "secret\n");
		await writeFile(join(rootDirectory, ".gitignore"), "secret.txt\n");
		
		await runCli(rootDirectory, [ "--output", outputDirectory, "--quiet", "--no-ansi" ]);
		
		const outputFile = join(outputDirectory, "flatr-test-1.2.3.md");
		const content = await readFile(outputFile, "utf8");
		
		expect(content).toContain("src/ok.ts");
		expect(content).not.toContain("secret.txt");
	});
	
	it("adds counter when output file exists", async () => {
		const rootDirectory = await createTempProject("flatr-counter", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(outputDirectory, "flatr-counter-1.0.0.md"), "existing\n");
		
		await runCli(rootDirectory, [ "--output", outputDirectory, "--quiet", "--no-ansi" ]);
		
		const entries = await readdir(outputDirectory);
		expect(entries).toContain("flatr-counter-1.0.0-1.md");
	});
	
	it("does not write output in dry-run", async () => {
		const rootDirectory = await createTempProject("flatr-dry", "2.0.0");
		const outputDirectory = join(rootDirectory, "out");
		
		await mkdir(outputDirectory, { recursive: true });
		const before = await readdir(outputDirectory);
		
		await runCli(rootDirectory, [ "--output", outputDirectory, "--dry-run", "--quiet", "--no-ansi" ]);
		
		const after = await readdir(outputDirectory);
		expect(after).toEqual(before);
	});
	
	it("writes valid json output", async () => {
		const rootDirectory = await createTempProject("flatr-json", "3.1.0");
		const outputDirectory = join(rootDirectory, "out");
		
		await mkdir(outputDirectory, { recursive: true });
		
		await runCli(rootDirectory, [ "--output", outputDirectory, "--format", "json", "--quiet", "--no-ansi" ]);
		
		const outputFile = join(outputDirectory, "flatr-json-3.1.0.json");
		const content = await readFile(outputFile, "utf8");
		const parsed = JSON.parse(content) as { tree?: unknown; stats?: unknown; rootDirectory?: string };
		
		expect(parsed.tree).toBeDefined();
		expect(parsed.stats).toBeDefined();
		expect(parsed.rootDirectory).toBeDefined();
		
		if (!parsed.rootDirectory)
			throw new Error("Missing rootDirectory in json output.");
		
		const resolvedRoot = await realpath(rootDirectory);
		const resolvedReported = await realpath(parsed.rootDirectory);
		
		expect(resolvedReported).toBe(resolvedRoot);
	});
	
	it("uses folder name when version is missing", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "flatr-noversion-"));
		const outputDirectory = join(rootDirectory, "out");
		
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "readme.txt"), "ok\n");
		
		await runCli(rootDirectory, [ "--output", outputDirectory, "--quiet", "--no-ansi" ]);
		
		const outputFile = join(outputDirectory, `${basename(rootDirectory)}.md`);
		const content = await readFile(outputFile, "utf8");
		
		expect(content).toContain("readme.txt");
	});
	
	it("wraps markdown with triple backticks in quad backticks", async () => {
		const rootDirectory = await createTempProject("flatr-fence", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		
		await mkdir(outputDirectory, { recursive: true });
		
		const readmeContent = "# Test\n\n```bash\nnpm install\n```\n";
		await writeFile(join(rootDirectory, "README.md"), readmeContent);
		
		await runCli(rootDirectory, [ "--output", outputDirectory, "--quiet", "--no-ansi" ]);
		
		const outputFile = join(outputDirectory, "flatr-fence-1.0.0.md");
		const content = await readFile(outputFile, "utf8");
		
		// Содержимое должно быть без экранирования
		expect(content).toContain("```bash");
		expect(content).not.toContain("\\`\\`\\`");
		
		// Блок должен быть обёрнут в четыре бэктика
		const lines = content.split("\n");
		const readmeStart = lines.indexOf("### README.md");
		expect(lines[readmeStart + 1]).toBe("````md");
		
		// Найти закрывающий fence
		const closingFence = lines.slice(readmeStart + 2).indexOf("````");
		expect(closingFence).toBeGreaterThan(0);
	});
	
	it("ends output with single newline", async () => {
		const rootDirectory = await createTempProject("flatr-newline", "1.0.0");
		const outputDirectory = join(rootDirectory, "out");
		
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(rootDirectory, "test.txt"), "content\n");
		
		await runCli(rootDirectory, [ "--output", outputDirectory, "--quiet", "--no-ansi" ]);
		
		const outputFile = join(outputDirectory, "flatr-newline-1.0.0.md");
		const content = await readFile(outputFile, "utf8");
		
		// Файл должен заканчиваться одним переносом строки
		expect(content.endsWith("\n")).toBe(true);
		expect(content.endsWith("\n\n")).toBe(false);
	});
	
	it("outputs version with --version flag", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "flatr-version-"));
		
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
			await runCli(rootDirectory, [ "--version", "--no-ansi" ]);
		} catch {
			// Expected - process.exit throws in tests
		}
		
		// eslint-disable-next-line require-atomic-updates
		console.info = originalLog;
		// eslint-disable-next-line require-atomic-updates
		process.exit = originalExit;
		
		expect(exitCode).toBe(0);
		expect(output).toMatch(/^\d+\.\d+\.\d+$/);
	});
	
	it("outputs version with -v flag", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "flatr-version-"));
		
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
			await runCli(rootDirectory, [ "-v", "--no-ansi" ]);
		} catch {
			// Expected - process.exit throws in tests
		}
		
		// eslint-disable-next-line require-atomic-updates
		console.info = originalLog;
		// eslint-disable-next-line require-atomic-updates
		process.exit = originalExit;
		
		expect(exitCode).toBe(0);
		expect(output).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
