import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";

async function createMixedProject(): Promise<string> {
	const input = await mkdtemp(join(tmpdir(), "fln-outline-compress-"));
	await writeFile(
		join(input, "package.json"),
		JSON.stringify(
			{
				name: "outline-compress-fixture",
				version: "1.0.0",
			},
			null,
			"\t",
		),
	);
	await writeFile(
		join(input, "code.ts"),
		[
			'import { something } from "./other";',
			"",
			"export function add(a: number, b: number): number {",
			"	return a + b;",
			"}",
			"",
			"export class Calculator {",
			"	private total = 0;",
			"	add(n: number): void { this.total += n; }",
			"}",
			"",
		].join("\n"),
	);
	await writeFile(
		join(input, "notes.txt"),
		"free-form notes with no extractor\nline two\n",
	);

	return input;
}

function extractFileBody(output: string, fileName: string): string | undefined {
	const header = `### ${fileName}`;
	const headerIndex = output.indexOf(header);
	if (headerIndex === -1) return undefined;
	const lineEnd = output.indexOf("\n", headerIndex) + 1;
	const openFenceMatch = output.slice(lineEnd).match(/^(`{3,})[^\n]*\n/);
	if (!openFenceMatch) return undefined;
	const [full, fence] = openFenceMatch;
	const bodyStart = lineEnd + full.length;
	const closingIndex = output.indexOf(`\n${fence}`, bodyStart);
	if (closingIndex === -1) return undefined;

	return output.slice(bodyStart, closingIndex);
}

describe("--compress vs --outline separation", () => {
	it("--compress: extracts signatures for supported files, streams full content for others", async () => {
		const input = await createMixedProject();
		const outDir = await mkdtemp(join(tmpdir(), "fln-compress-out-"));
		const outputPath = join(outDir, "compress.md");

		await fln({
			input,
			output: outputPath,
			compress: true,
			logLevel: "silent",
		});

		const output = await readFile(outputPath, "utf8");
		const codeBody = extractFileBody(output, "code.ts");
		const notesBody = extractFileBody(output, "notes.txt");

		expect(codeBody).toBeDefined();
		expect(codeBody).toContain("export function add");
		expect(codeBody).toContain("export class Calculator");
		expect(codeBody).not.toContain("return a + b;");
		expect(codeBody).not.toContain("this.total += n;");

		expect(notesBody).toBeDefined();
		expect(notesBody).toContain("free-form notes with no extractor");
		expect(notesBody).toContain("line two");
	});

	it("--outline: signatures for supported files, placeholder for unsupported", async () => {
		const input = await createMixedProject();
		const outDir = await mkdtemp(join(tmpdir(), "fln-outline-out-"));
		const outputPath = join(outDir, "outline.md");

		await fln({
			input,
			output: outputPath,
			outline: true,
			logLevel: "silent",
		});

		const output = await readFile(outputPath, "utf8");
		const codeBody = extractFileBody(output, "code.ts");
		const notesBody = extractFileBody(output, "notes.txt");

		expect(codeBody).toBeDefined();
		expect(codeBody).toContain("export function add");
		expect(codeBody).not.toContain("return a + b;");

		expect(notesBody).toBeDefined();
		expect(notesBody).toContain("no signature extractor for notes.txt");
	});

	it("--outline produces different output than --compress for unsupported files", async () => {
		const input = await createMixedProject();
		const compressDir = await mkdtemp(join(tmpdir(), "fln-cmp-"));
		const outlineDir = await mkdtemp(join(tmpdir(), "fln-out-"));

		const compressPath = join(compressDir, "c.md");
		const outlinePath = join(outlineDir, "o.md");

		await fln({
			input,
			output: compressPath,
			compress: true,
			logLevel: "silent",
		});
		await fln({
			input,
			output: outlinePath,
			outline: true,
			logLevel: "silent",
		});

		const compressOutput = await readFile(compressPath, "utf8");
		const outlineOutput = await readFile(outlinePath, "utf8");

		const compressNotes = extractFileBody(compressOutput, "notes.txt");
		const outlineNotes = extractFileBody(outlineOutput, "notes.txt");

		expect(compressNotes).toContain("free-form notes");
		expect(outlineNotes).toContain("no signature extractor");
		expect(compressNotes).not.toEqual(outlineNotes);
	});
});

describe("--strict-toctou", () => {
	it("accepts the flag without error on a stable project", async () => {
		const input = await createMixedProject();
		const outDir = await mkdtemp(join(tmpdir(), "fln-toctou-stable-"));
		const outputPath = join(outDir, "stable.md");

		const result = await fln({
			input,
			output: outputPath,
			strictToctou: true,
			logLevel: "silent",
		});

		expect(result.filesIncluded).toBeGreaterThan(0);
	});
});
