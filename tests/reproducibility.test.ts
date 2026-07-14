import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";

async function createReproProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "fln-repro-"));
	await writeFile(
		join(dir, "package.json"),
		JSON.stringify({ name: "repro-test", version: "1.0.0" }, null, "\t"),
	);
	await mkdir(join(dir, "src"), { recursive: true });
	await writeFile(join(dir, "src", "index.ts"), "export const value = 1;\n");
	await writeFile(join(dir, "README.md"), "# Repro\n");

	return dir;
}

describe("reproducibility", () => {
	it("produces identical output for the same input and --date", async () => {
		const input = await createReproProject();
		const outDir = await mkdtemp(join(tmpdir(), "fln-repro-out-"));
		const fixedDate = "2026-01-01 00:00";
		const outputA = join(outDir, "a.md");
		const outputB = join(outDir, "b.md");

		await fln({
			input,
			output: outputA,
			date: fixedDate,
			overwrite: true,
			logLevel: "silent",
			ansi: false,
		});
		await fln({
			input,
			output: outputB,
			date: fixedDate,
			overwrite: true,
			logLevel: "silent",
			ansi: false,
		});

		const [contentA, contentB] = await Promise.all([
			readFile(outputA, "utf8"),
			readFile(outputB, "utf8"),
		]);
		expect(contentA).toBe(contentB);
	});
});
