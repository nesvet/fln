import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { fln } from "../src/api/index.js";


describe("fln API", () => {
	it("processes project and returns FlnResult", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-api-"));
		await writeFile(join(input, "package.json"), JSON.stringify({ name: "api-test", version: "1.0.0" }, null, "\t"));
		await mkdir(join(input, "src"), { recursive: true });
		await writeFile(join(input, "src/index.ts"), "export const x = 1;\n");
		
		const output = join(input, "out.md");
		const result = await fln({
			input,
			output,
			includeContents: true,
			includeTree: true
		});
		
		expect(result.projectName).toBe("api-test");
		expect(result.files).toBeGreaterThanOrEqual(1);
		expect(result.outputPath).toBe(output);
		expect(result.outputTokenCount).toBeGreaterThan(0);
		expect(result.outputSizeBytes).toBeGreaterThan(0);
		
		const content = await readFile(output, "utf8");
		expect(content).toContain("src/index.ts");
		expect(content).toContain("export const x = 1");
	});
});
