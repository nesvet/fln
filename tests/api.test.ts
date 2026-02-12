import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";


const distExists = existsSync(join(import.meta.dir, "../dist/api/index.js"));

describe.skipIf(!distExists)("fln API", () => {
	it("processes project and returns FlnResult", async () => {
		// @ts-expect-error — dynamic import of built output, exists only after build
		const { fln } = await import("../dist/api/index.js");
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-api-"));
		await writeFile(join(rootDirectory, "package.json"), JSON.stringify({ name: "api-test", version: "1.0.0" }, null, "\t"));
		await mkdir(join(rootDirectory, "src"), { recursive: true });
		await writeFile(join(rootDirectory, "src/index.ts"), "export const x = 1;\n");
		
		const outputFile = join(rootDirectory, "out.md");
		const result = await fln({
			rootDirectory,
			outputFile,
			includeContents: true,
			includeTree: true
		});
		
		expect(result.projectName).toBe("api-test");
		expect(result.files).toBeGreaterThanOrEqual(1);
		expect(result.outputPath).toBe(outputFile);
		expect(result.outputTokenCount).toBeGreaterThan(0);
		expect(result.outputSizeBytes).toBeGreaterThan(0);
		
		const content = await readFile(outputFile, "utf8");
		expect(content).toContain("src/index.ts");
		expect(content).toContain("export const x = 1");
	});
});
