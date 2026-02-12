import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";


const projectRoot = join(import.meta.dir, "..");
const cliPath = join(projectRoot, "dist", "cli", "index.js");

describe.skipIf(!existsSync(cliPath))("npm CLI (Node ESM)", () => {
	it("runs --help via node", async () => {
		const proc = Bun.spawn([ "node", cliPath, "--help" ], {
			cwd: projectRoot,
			stdout: "pipe",
			stderr: "pipe"
		});
		const text = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		expect(exitCode).toBe(0);
		expect(text).toContain("fln");
	});
	
	it("generates output via node subprocess", async () => {
		const rootDirectory = await mkdtemp(join(tmpdir(), "fln-npm-cli-"));
		await writeFile(join(rootDirectory, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }, null, "\t"));
		await writeFile(join(rootDirectory, "readme.txt"), "hello\n");
		
		const outputPath = join(rootDirectory, "out.md");
		const proc = Bun.spawn(
			[ "node", cliPath, ".", "-o", outputPath, "--quiet", "--no-ansi" ],
			{ cwd: rootDirectory, stdout: "pipe", stderr: "pipe" }
		);
		await proc.exited;
		const content = await readFile(outputPath, "utf8");
		
		expect(proc.exitCode).toBe(0);
		expect(content).toContain("readme.txt");
		expect(content).toContain("hello");
	});
});
