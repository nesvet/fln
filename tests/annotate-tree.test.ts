import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";
import { resolveAnnotateTree } from "../src/config/resolver.js";

describe("--annotate-tree", () => {
	it("size mode annotates tree at the top from metadata", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-annotate-size-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "annotate-size", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "alpha.ts"), "export const alpha = 1;\n");

		const output = join(input, "out.md");
		await fln({
			input,
			output,
			overwrite: true,
			tree: true,
			annotateTree: "size",
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const content = await readFile(output, "utf8");
		const treeIndex = content.indexOf("## Directory Tree");
		const sourceIndex = content.indexOf("## Source Files");
		expect(treeIndex).toBeGreaterThanOrEqual(0);
		expect(sourceIndex).toBeGreaterThan(treeIndex);
		expect(content).toMatch(/alpha\.ts.*\(/);
	});

	it("tokens mode moves annotated tree to the end", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-annotate-tokens-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "annotate-tokens", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "beta.ts"), "export const beta = 2;\n");

		const output = join(input, "out.md");
		await fln({
			input,
			output,
			overwrite: true,
			tree: true,
			annotateTree: "tokens",
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const content = await readFile(output, "utf8");
		const treeIndex = content.indexOf("## Directory Tree");
		const sourceIndex = content.indexOf("## Source Files");
		expect(treeIndex).toBeGreaterThan(sourceIndex);
		expect(content).toMatch(/beta\.ts.*tokens\)/);
	});

	it("lines mode annotates tree at the end", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-annotate-lines-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "annotate-lines", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "gamma.ts"), "line one\nline two\n");

		const output = join(input, "out.md");
		await fln({
			input,
			output,
			overwrite: true,
			tree: true,
			annotateTree: "lines",
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const content = await readFile(output, "utf8");
		expect(content.indexOf("## Directory Tree")).toBeGreaterThan(
			content.indexOf("## Source Files"),
		);
		expect(content).toMatch(/gamma\.ts.*lines\)/);
	});

	it("rejects invalid annotateTree values", () => {
		expect(() => resolveAnnotateTree("invalid")).toThrow(
			expect.objectContaining({ code: "INVALID_CONFIG" }),
		);
	});

	it("JSON output includes treeAnnotation and reorders root after files", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-annotate-json-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "annotate-json", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "delta.ts"), "export const delta = 4;\n");

		const output = join(input, "out.json");
		await fln({
			input,
			output,
			overwrite: true,
			format: "json",
			tree: true,
			annotateTree: "tokens",
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const raw = await readFile(output, "utf8");
		const filesIndex = raw.indexOf('"files"');
		const rootIndex = raw.indexOf('"root"');
		expect(filesIndex).toBeGreaterThanOrEqual(0);
		expect(rootIndex).toBeGreaterThan(filesIndex);

		const parsed = JSON.parse(raw) as {
			root: { children?: Array<{ treeAnnotation?: { tokens?: number } }> };
		};
		const fileNode = parsed.root.children?.find(
			(child) => child.treeAnnotation?.tokens !== undefined,
		);
		expect(fileNode?.treeAnnotation?.tokens).toBeGreaterThan(0);
	});
});
