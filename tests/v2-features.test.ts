import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";
import { getProjectMetadata, resolveConfig } from "../src/config/index.js";
import { stripBlockComments } from "../src/core/compress.js";
import {
	analyzeTextFileHeader,
	readTextFile,
	setFileContentTestHooks,
} from "../src/core/fileContent.js";
import { sortFileNodesByPriority } from "../src/core/filePriority.js";
import { scanTree, writeOutput } from "../src/core/index.js";
import { escapeJsonStringValue } from "../src/core/streamJson.js";
import type { FileNode } from "../src/core/types.js";
import { createLogger } from "../src/infra/index.js";

function findFileNode(
	root: FileNode,
	relativePath: string,
): FileNode | undefined {
	if (root.path === relativePath) return root;

	for (const child of root.children ?? []) {
		const found = findFileNode(child, relativePath);
		if (found) return found;
	}

	return undefined;
}

describe("2.x features", () => {
	it("dry-run skips output write and content cache", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-dry-api-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "dry", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "sample.txt"), "hello\n");

		const result = await fln({
			input,
			dryRun: true,
			logLevel: "silent",
		});

		expect(result.outputPath).toBe("");
		expect(result.outputSizeBytes).toBe(0);
		expect(result.filesIncluded).toBeGreaterThan(0);
	});

	it("places README before test files when maxTokens limits output", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-priority-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "prio", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "README.md"), "# Readme\n".repeat(20));
		await writeFile(
			join(input, "widget.test.ts"),
			"export const test = 1;\n".repeat(30),
		);

		await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			maxTokens: 120,
			tree: false,
			logLevel: "silent",
		});

		const content = await readFile(join(input, "out", "out.md"), "utf8");
		const readmeIndex = content.indexOf("### README.md");
		const testIndex = content.indexOf("### widget.test.ts");
		expect(readmeIndex).toBeGreaterThanOrEqual(0);
		expect(testIndex).toBe(-1);
	});

	it("includes explicit file larger than maxFileSize via stream at render", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-large-include-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "big", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "large.txt"), "L".repeat(20_000));

		await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			maxFileSize: 1000,
			include: ["large.txt"],
			logLevel: "silent",
		});

		const { root } = await fln.inspect({
			input,
			maxFileSize: 1000,
			include: ["large.txt"],
			logLevel: "silent",
		});
		const node = findFileNode(root, "large.txt");
		expect(node).toBeDefined();

		const content = await readFile(join(input, "out", "out.md"), "utf8");
		expect(content).toContain("### large.txt");
		expect(content).toContain("LLLL");
	});

	it("scan never full-reads file bodies; render still outputs", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-cache-budget-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "cache", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "a.txt"), "alpha-content-0123456789\n");
		await writeFile(join(input, "b.txt"), "beta-content-0123456789\n");

		const metadata = await getProjectMetadata(input);
		const logger = createLogger({ ansi: false, logLevel: "debug" });
		let readTextFileCalls = 0;
		setFileContentTestHooks({
			onReadTextFile: () => {
				readTextFileCalls++;
			},
		});

		try {
			const scanResult = await scanTree(
				{
					projectName: metadata.name,
					input,
					exclude: [],
					include: [],
					only: ["a.txt", "b.txt"],
					onlyMode: true,
					excludedPaths: [],
					includeHidden: false,
					gitignore: false,
					maxFileSize: 10 * 1024 * 1024,
					maxTotalSize: 0,
					tokenModel: "estimate",
					contents: true,
					followSymlinks: false,
					dryRun: false,
					encoding: "utf8",
					securityPatterns: [],
				},
				logger,
			);

			expect(readTextFileCalls).toBe(0);

			const config = resolveConfig(
				input,
				{
					output: join(input, "out", "out.md"),
					overwrite: true,
					logLevel: "silent",
				},
				{},
			);
			await writeOutput(
				scanResult,
				config,
				createLogger({ ansi: false, logLevel: "silent" }),
			);

			const content = await readFile(join(input, "out", "out.md"), "utf8");
			expect(content).toContain("alpha-content");
			expect(content).toContain("beta-content");
		} finally {
			setFileContentTestHooks(undefined);
		}
	});

	it("collapses directory tree lines when compress is enabled", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-compress-tree-"));
		await mkdir(join(input, "out"), { recursive: true });
		await mkdir(join(input, "src", "nested"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "cmp", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "src", "nested", "file.ts"), "export {}\n");

		await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			compress: true,
			only: ["src/nested/file.ts"],
			onlyMode: true,
			logLevel: "silent",
		});

		const content = await readFile(join(input, "out", "out.md"), "utf8");
		expect(content).toContain("## Directory Tree");
		expect(content).not.toMatch(/src\s{2,}nested/);
		expect(content).toContain("src/nested");
	});

	it("exports omittedByReason in json stats", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-omitted-json-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "omit", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".env"), "SECRET=1\n");
		await writeFile(join(input, "README.md"), "# Readme\n".repeat(40));
		await writeFile(join(input, "widget.test.ts"), "test\n".repeat(40));

		await fln({
			input,
			output: join(input, "out", "out.json"),
			overwrite: true,
			format: "json",
			include: [".env", "README.md", "widget.test.ts"],
			includeHidden: true,
			maxTokens: 80,
			logLevel: "silent",
		});

		const content = await readFile(join(input, "out", "out.json"), "utf8");
		const parsed = JSON.parse(content) as {
			stats?: { omittedByReason?: Record<string, number> };
		};
		expect(parsed.stats?.omittedByReason?.security).toBeGreaterThan(0);
		expect(
			(parsed.stats?.omittedByReason?.tokenLimit ?? 0) > 0 ||
				(parsed.stats?.omittedByReason?.totalSizeLimit ?? 0) > 0,
		).toBe(true);
	});

	it("uses encoding-aware backtick sample for large utf16 files", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-utf16-fence-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "utf16", version: "1.0.0" }, null, "\t"),
		);
		const utf16Body = `${"`".repeat(5)}text\n`;
		const utf16Buffer = Buffer.alloc(2 + utf16Body.length * 2);
		utf16Buffer[0] = 0xff;
		utf16Buffer[1] = 0xfe;
		for (let index = 0; index < utf16Body.length; index++) {
			const offset = 2 + index * 2;
			utf16Buffer[offset] = utf16Body.codePointAt(index) ?? 0;
			utf16Buffer[offset + 1] = 0;
		}
		await writeFile(join(input, "wide.txt"), utf16Buffer);

		await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			maxFileSize: 50,
			include: ["wide.txt"],
			logLevel: "silent",
		});

		const content = await readFile(join(input, "out", "out.md"), "utf8");
		const sectionStart = content.indexOf("### wide.txt");
		expect(sectionStart).toBeGreaterThanOrEqual(0);
		const section = content.slice(sectionStart, sectionStart + 200);
		expect(section).toMatch(/`{6,}/);
		expect(section).toContain("text");
	});

	it("embeds diff hunks when diffHunks and since are set", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-diff-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "diff", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "src.ts"), "const value = 1;\n");

		execSync("git init", { cwd: input });
		execSync("git config user.email test@test && git config user.name Test", {
			cwd: input,
		});
		execSync("git add -A && git commit -m initial", { cwd: input });
		await writeFile(join(input, "src.ts"), "const value = 2;\n");

		await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			since: "HEAD",
			diffHunks: true,
			only: ["src.ts"],
			onlyMode: true,
			logLevel: "silent",
		});

		const content = await readFile(join(input, "out", "out.md"), "utf8");
		expect(content).toContain("@@");
		expect(content).toContain("diff --git");
	});

	it("writes split output parts when token budget is exceeded", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-split-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "split", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "first.txt"),
			"one two three four five six seven eight\n".repeat(5),
		);
		await writeFile(
			join(input, "second.txt"),
			"alpha beta gamma delta epsilon zeta\n".repeat(5),
		);

		const result = await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			maxTokens: 40,
			outputSplit: 2,
			only: ["first.txt", "second.txt"],
			onlyMode: true,
			tree: false,
			logLevel: "silent",
		});
		expect(result.outputPath).toContain("out.md");

		const partTwo = await readFile(join(input, "out", "out.part2.md"), "utf8");
		expect(partTwo).toContain("Part 2 of 2");
	});

	it("warns on TOCTOU when file changes between scan and render", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-toctou-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "toctou", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "volatile.txt"), "original\n");

		const metadata = await getProjectMetadata(input);
		const config = resolveConfig(
			input,
			{
				output: join(input, "out", "out.md"),
				overwrite: true,
				logLevel: "verbose",
			},
			{},
		);
		config.output = join(input, "out", "out.md");

		const logger = createLogger({ ansi: false, logLevel: "verbose" });
		const result = await scanTree(
			{
				projectName: metadata.name,
				input: config.input,
				exclude: config.exclude,
				include: config.include,
				only: config.only,
				onlyMode: false,
				excludedPaths: config.excludedPaths,
				includeHidden: config.includeHidden,
				gitignore: config.gitignore,
				maxFileSize: config.maxFileSize,
				maxTotalSize: config.maxTotalSize,
				tokenModel: config.tokenModel,
				contents: config.contents,
				followSymlinks: config.followSymlinks,
				dryRun: false,
				encoding: config.encoding,
				securityPatterns: config.securityPatterns,
			},
			logger,
		);

		await writeFile(join(input, "volatile.txt"), "changed after scan\n");

		const warnings: string[] = [];
		const originalWarn = console.warn;
		console.warn = (message?: unknown) => {
			warnings.push(String(message));
		};

		try {
			await writeOutput(result, config, logger);
		} finally {
			console.warn = originalWarn;
		}

		expect(warnings.some((line) => line.includes("changed since scan"))).toBe(
			true,
		);
	});

	it("marks .env with security skipReason in tree json", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-security-json-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "sec", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".env"), "SECRET=1\n");
		await writeFile(join(input, "ok.txt"), "ok\n");

		await fln({
			input,
			output: join(input, "out", "out.json"),
			overwrite: true,
			format: "json",
			include: [".env"],
			logLevel: "silent",
		});

		const { root } = await fln.inspect({
			input,
			format: "json",
			include: [".env"],
			logLevel: "silent",
		});
		const envNode = findFileNode(root, ".env");
		expect(envNode?.skipReason).toBe("security");
	});

	it("writes large json without loading full file as single stringify", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-json-large-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "jsonlg", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "big.json"),
			`{"key":${JSON.stringify("x".repeat(600_000))}}\n`,
		);

		await fln({
			input,
			output: join(input, "out", "out.json"),
			overwrite: true,
			format: "json",
			only: ["big.json"],
			onlyMode: true,
			logLevel: "silent",
		});

		const content = await readFile(join(input, "out", "out.json"), "utf8");
		expect(content).toContain('"schemaVersion":2');
		expect(content).toContain("big.json");
	});

	it("sortFileNodesByPriority places README before tests", () => {
		const nodes = [
			{ name: "widget.test.ts", path: "widget.test.ts" },
			{ name: "README.md", path: "README.md" },
		];
		sortFileNodesByPriority(nodes);
		expect(nodes[0].name).toBe("README.md");
	});

	it("sortFileNodesByPriority deprioritizes entry points in test directories", () => {
		const nodes = [
			{ name: "index.ts", path: "tests/index.ts" },
			{ name: "index.ts", path: "src/index.ts" },
		];
		sortFileNodesByPriority(nodes);
		expect(nodes[0].path).toBe("src/index.ts");
		expect(nodes[1].path).toBe("tests/index.ts");
	});

	it("sortFileNodesByPriority deprioritizes files in vendor/build/dist dirs", () => {
		const nodes = [
			{ name: "main.go", path: "vendor/main.go" },
			{ name: "main.go", path: "cmd/main.go" },
		];
		sortFileNodesByPriority(nodes);
		expect(nodes[0].path).toBe("cmd/main.go");
		expect(nodes[1].path).toBe("vendor/main.go");
	});

	it("sortFileNodesByPriority keeps test-file score 20 even outside test dirs", () => {
		const nodes = [
			{ name: "utils.test.ts", path: "src/utils.test.ts" },
			{ name: "index.ts", path: "src/index.ts" },
		];
		sortFileNodesByPriority(nodes);
		expect(nodes[0].name).toBe("index.ts");
		expect(nodes[1].name).toBe("utils.test.ts");
	});

	it("treats UTF-16 BOM as text in header analysis", () => {
		const buffer = Buffer.from([0xff, 0xfe, 0x48, 0x00]);
		const result = analyzeTextFileHeader(buffer, buffer.length);
		expect(result.isBinary).toBe(false);
	});

	it("skips .env paths via security matcher", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-security-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "sec", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".env"), "SECRET=1\n");
		await writeFile(join(input, "ok.txt"), "ok\n");

		await fln({
			input,
			output: join(input, "out", "out.md"),
			overwrite: true,
			logLevel: "silent",
		});

		const content = await readFile(join(input, "out", "out.md"), "utf8");
		expect(content).not.toContain("SECRET=1");
		expect(content).toContain("ok.txt");
	});

	it("escapeJsonStringValue escapes control characters", () => {
		expect(escapeJsonStringValue("a\nb")).toBe(String.raw`a\nb`);
	});

	it("readTextFile decodes utf8 content", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-encoding-"));
		await writeFile(join(input, "plain.txt"), "hello\n");
		const { text } = await readTextFile(join(input, "plain.txt"));
		expect(text).toBe("hello\n");
	});

	it("stripBlockComments removes block comments outside strings", () => {
		const code = "const x = 1;\n/* comment */\nconst y = 2;\n";
		const result = stripBlockComments(code, "test.ts");
		expect(result).toBe("const x = 1;\n\nconst y = 2;\n");
	});

	it("stripBlockComments preserves block comments inside string literals", () => {
		const code = 'const s = "a /* not a comment */ b";\n/* real comment */\n';
		const result = stripBlockComments(code, "test.ts");
		expect(result).toBe('const s = "a /* not a comment */ b";\n\n');
	});

	it("stripBlockComments removes line comments outside strings", () => {
		const code = "const x = 1; // comment\nconst y = 2;\n";
		const result = stripBlockComments(code, "test.ts");
		expect(result).toBe("const x = 1; \nconst y = 2;\n");
	});

	it("stripBlockComments preserves line comments inside string literals", () => {
		const code = 'const s = "code // not a comment";\n// real comment\n';
		const result = stripBlockComments(code, "test.ts");
		expect(result).toBe('const s = "code // not a comment";\n\n');
	});

	it("stripBlockComments preserves template literals with comment-like content", () => {
		const code = "const s = `template /* not removed */ end`;\n/* removed */\n";
		const result = stripBlockComments(code, "test.ts");
		expect(result).toBe("const s = `template /* not removed */ end`;\n\n");
	});

	it("stripBlockComments handles escaped quotes in strings", () => {
		const code = 'const s = "say \\"hi\\" /* not removed */";\n/* removed */\n';
		const result = stripBlockComments(code, "test.ts");
		expect(result).toBe('const s = "say \\"hi\\" /* not removed */";\n\n');
	});

	it("stripBlockComments strips CSS comments outside strings", () => {
		const css =
			'.a { color: red; }\n/* comment */\n.b { content: "/* not removed */"; }\n';
		const result = stripBlockComments(css, "style.css");
		expect(result).toBe(
			'.a { color: red; }\n\n.b { content: "/* not removed */"; }\n',
		);
	});
});
