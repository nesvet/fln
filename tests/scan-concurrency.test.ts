import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTree } from "../src/core/index.js";
import { createLogger } from "../src/infra/index.js";

const scanOptionsBase = {
	projectName: "wide-tree",
	exclude: [] as string[],
	include: [] as string[],
	only: [] as string[],
	onlyMode: false,
	excludedPaths: [] as string[],
	includeHidden: false,
	gitignore: false,
	maxFileSize: 10 * 1024 * 1024,
	maxTotalSize: 0,
	tokenModel: "estimate" as const,
	contents: false,
	dryRun: true,
	followSymlinks: false,
	securityPatterns: [] as string[],
	encoding: "utf8" as const,
};

async function createWideParallelTree(): Promise<string> {
	const input = await mkdtemp(join(tmpdir(), "fln-scan-concurrency-"));
	await writeFile(
		join(input, "package.json"),
		JSON.stringify({ name: "wide-tree", version: "1.0.0" }, null, "\t"),
	);

	const directoryCount = 80;
	const filesPerDirectory = 4;

	await Promise.all(
		Array.from({ length: directoryCount }, async (_, directoryIndex) => {
			const directoryPath = join(input, `dir-${directoryIndex}`);
			await mkdir(directoryPath, { recursive: true });
			await Promise.all(
				Array.from(
					{ length: filesPerDirectory },
					async (_unused, fileIndex) => {
						await writeFile(
							join(directoryPath, `file-${fileIndex}.txt`),
							`content-${directoryIndex}-${fileIndex}\n`,
						);
					},
				),
			);
		}),
	);

	return input;
}

describe("scan concurrency", () => {
	it("completes wide parallel directory tree without deadlock", async () => {
		const input = await createWideParallelTree();
		const logger = createLogger({ ansi: false, logLevel: "silent" });
		const timeoutMs = 5000;

		const result = await Promise.race([
			scanTree({ ...scanOptionsBase, input }, logger),
			new Promise<never>((_, reject) => {
				setTimeout(
					() => reject(new Error("scanTree timed out (deadlock?)")),
					timeoutMs,
				);
			}),
		]);

		expect(result.stats.filesScanned).toBeGreaterThan(250);
		expect(result.stats.directories).toBeGreaterThan(80);
	});
});
