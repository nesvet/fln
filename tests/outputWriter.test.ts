import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOutputWriter } from "../src/infra/outputWriter.js";

describe("createOutputWriter", () => {
	it("writes atomically via temp file and rename", async () => {
		const directory = await mkdtemp(join(tmpdir(), "fln-writer-"));
		const outputPath = join(directory, "out.md");
		const writer = await createOutputWriter(outputPath);

		await writer.writeLine("hello");
		await writer.close();

		const content = await readFile(outputPath, "utf8");
		expect(content).toBe("hello\n");

		const directoryEntries = await Array.fromAsync(
			new Bun.Glob("*.tmp").scan(directory),
		);
		expect(directoryEntries).toHaveLength(0);
	});

	it("discards partial output when write fails max size", async () => {
		const directory = await mkdtemp(join(tmpdir(), "fln-writer-limit-"));
		const outputPath = join(directory, "out.md");
		const writer = await createOutputWriter(outputPath, 5, {
			strictLimits: true,
		});

		await writer.write("1234");

		await expect(writer.write("56")).rejects.toThrow("exceed maximum");
		await writer.discard();

		await expect(stat(outputPath)).rejects.toThrow();
	});
});
