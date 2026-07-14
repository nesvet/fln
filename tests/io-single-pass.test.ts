import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";
import { getProjectMetadata, resolveConfig } from "../src/config/index.js";
import { setFileContentTestHooks } from "../src/core/fileContent.js";
import { scanTree, writeOutput } from "../src/core/index.js";
import { createLogger } from "../src/infra/index.js";

describe("single-pass I/O", () => {
	it("scan does not call readTextFile for files larger than backtick sample", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-io-single-pass-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "io", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "large.txt"), `${"x".repeat(80_000)}\n`);
		await writeFile(join(input, "small.txt"), "small-content\n");

		const metadata = await getProjectMetadata(input);
		const logger = createLogger({ ansi: false, logLevel: "silent" });
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
					only: ["large.txt", "small.txt"],
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
			await writeOutput(scanResult, config, logger);

			const content = await readFile(join(input, "out", "out.md"), "utf8");
			expect(content).toContain("small-content");
			expect(content).toContain("xxxx");
		} finally {
			setFileContentTestHooks(undefined);
		}
	});

	it("dry-run scan never calls readTextFile", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-io-dry-run-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "dry", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "note.txt"), "dry-run-content\n");

		let readTextFileCalls = 0;
		setFileContentTestHooks({
			onReadTextFile: () => {
				readTextFileCalls++;
			},
		});

		try {
			await fln({
				input,
				dryRun: true,
				only: ["note.txt"],
				onlyMode: true,
				logLevel: "silent",
			});

			expect(readTextFileCalls).toBe(0);
		} finally {
			setFileContentTestHooks(undefined);
		}
	});
});
