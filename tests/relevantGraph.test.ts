import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";
import { scanTree } from "../src/core/index.js";
import {
	parseImports,
	resolveRelevantFiles,
} from "../src/core/relevantGraph.js";
import { createLogger } from "../src/infra/index.js";

function createSilentLogger() {
	return createLogger({ logLevel: "silent", ansi: false });
}

async function createRelevantProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "fln-relevant-"));
	await writeFile(
		join(dir, "package.json"),
		JSON.stringify({ name: "relevant-test", version: "1.0.0" }, null, "\t"),
	);

	await mkdir(join(dir, "src"), { recursive: true });
	await mkdir(join(dir, "src", "utils"), { recursive: true });
	await mkdir(join(dir, "src", "unrelated"), { recursive: true });

	await writeFile(
		join(dir, "src", "index.ts"),
		[
			'import { helper } from "./utils/helper";',
			'import { format } from "./formatter";',
			"",
			"export function main(): void {",
			"  console.log(format(helper()));",
			"}",
		].join("\n"),
	);

	await writeFile(
		join(dir, "src", "formatter.ts"),
		[
			'import { helper } from "./utils/helper";',
			"",
			"export function format(value: string): string {",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: test fixture string
			"  return `[${value}]`;",
			"}",
		].join("\n"),
	);

	await writeFile(
		join(dir, "src", "utils", "helper.ts"),
		[
			'import { config } from "./config";',
			"",
			"export function helper(): string {",
			"  return config.greeting;",
			"}",
		].join("\n"),
	);

	await writeFile(
		join(dir, "src", "utils", "config.ts"),
		["export const config = { greeting: 'hello' };"].join("\n"),
	);

	await writeFile(
		join(dir, "src", "unrelated", "extra.ts"),
		[
			'import { something } from "./something";',
			"export function extra(): void {}",
		].join("\n"),
	);

	await writeFile(join(dir, "README.md"), "# Relevant Test\n");

	return dir;
}

describe("parseImports", () => {
	it("parses ES module imports from TypeScript", () => {
		const code = [
			'import { readFile } from "node:fs/promises";',
			'import path from "node:path";',
			'export { main } from "./index";',
		].join("\n");

		const imports = parseImports(code, "test.ts");
		expect(imports).toContain("node:fs/promises");
		expect(imports).toContain("node:path");
		expect(imports).toContain("./index");
	});

	it("parses require calls from CommonJS", () => {
		const code =
			'const fs = require("node:fs");\nconst utils = require("./utils");\n';
		const imports = parseImports(code, "test.js");
		expect(imports).toContain("node:fs");
		expect(imports).toContain("./utils");
	});

	it("parses Python imports", () => {
		const code = [
			"import os",
			"from pathlib import Path",
			"from .utils import helper",
		].join("\n");

		const imports = parseImports(code, "test.py");
		expect(imports).toContain("os");
		expect(imports).toContain("pathlib");
		expect(imports).toContain(".utils");
	});

	it("parses Go imports", () => {
		const code = [
			"package main",
			"",
			"import (",
			'	"fmt"',
			'	"os"',
			")",
		].join("\n");

		const imports = parseImports(code, "test.go");
		expect(imports).toContain("fmt");
		expect(imports).toContain("os");
	});

	it("parses Rust use statements", () => {
		const code = ["use std::fs;", "use std::io::Read;", "mod utils;"].join(
			"\n",
		);

		const imports = parseImports(code, "test.rs");
		expect(imports).toContain("std::fs");
		expect(imports).toContain("std::io::Read");
		expect(imports).toContain("utils");
	});

	it("parses Java imports", () => {
		const code = [
			"package com.example;",
			"",
			"import java.util.List;",
			"import com.example.utils.Helper;",
		].join("\n");

		const imports = parseImports(code, "Test.java");
		expect(imports).toContain("java.util.List");
		expect(imports).toContain("com.example.utils.Helper");
	});

	it("parses C #include directives", () => {
		const code = ["#include <stdio.h>", '#include "utils.h"'].join("\n");

		const imports = parseImports(code, "test.c");
		expect(imports).toContain("stdio.h");
		expect(imports).toContain("utils.h");
	});

	it("returns empty array for unsupported file types", () => {
		const code = "# Hello\nThis is markdown.\n";
		const imports = parseImports(code, "test.md");
		expect(imports).toHaveLength(0);
	});
});

describe("resolveRelevantFiles", () => {
	it("resolves transitively connected files from seed", async () => {
		const input = await createRelevantProject();

		const logger = createSilentLogger();
		const scan = await scanTree(
			{
				projectName: "relevant-test",
				input,
				exclude: [],
				include: [],
				only: [],
				onlyMode: false,
				excludedPaths: [],
				includeHidden: false,
				gitignore: true,
				maxFileSize: 10 * 1024 * 1024,
				maxTotalSize: 0,
				tokenModel: "estimate",
				contents: true,
				followSymlinks: false,
				dryRun: false,
				encoding: "auto",
				securityPatterns: [],
				onProgress: undefined,
			},
			logger,
		);

		const { relevantSet } = await resolveRelevantFiles(scan.root, input, [
			"src/index.ts",
		]);

		expect(relevantSet.has("src/index.ts")).toBe(true);
		expect(relevantSet.has("src/formatter.ts")).toBe(true);
		expect(relevantSet.has("src/utils/helper.ts")).toBe(true);
		expect(relevantSet.has("src/utils/config.ts")).toBe(true);
		expect(relevantSet.has("src/unrelated/extra.ts")).toBe(false);
	});

	it("prunes tree to only relevant files", async () => {
		const input = await createRelevantProject();

		const logger = createSilentLogger();
		const scan = await scanTree(
			{
				projectName: "relevant-test",
				input,
				exclude: [],
				include: [],
				only: [],
				onlyMode: false,
				excludedPaths: [],
				includeHidden: false,
				gitignore: true,
				maxFileSize: 10 * 1024 * 1024,
				maxTotalSize: 0,
				tokenModel: "estimate",
				contents: true,
				followSymlinks: false,
				dryRun: false,
				encoding: "auto",
				securityPatterns: [],
				onProgress: undefined,
			},
			logger,
		);

		const { root } = await resolveRelevantFiles(scan.root, input, [
			"src/index.ts",
		]);

		function findInTree(
			node: { path: string; children?: unknown[] },
			path: string,
		): boolean {
			if (node.path === path) return true;
			for (const child of (node.children as Array<{
				path: string;
				children?: unknown[];
			}>) ?? [])
				if (findInTree(child, path)) return true;

			return false;
		}

		expect(findInTree(root, "src/index.ts")).toBe(true);
		expect(findInTree(root, "src/formatter.ts")).toBe(true);
		expect(findInTree(root, "src/unrelated/extra.ts")).toBe(false);
	});

	it("returns all files when no seeds match", async () => {
		const input = await createRelevantProject();

		const logger = createSilentLogger();
		const scan = await scanTree(
			{
				projectName: "relevant-test",
				input,
				exclude: [],
				include: [],
				only: [],
				onlyMode: false,
				excludedPaths: [],
				includeHidden: false,
				gitignore: true,
				maxFileSize: 10 * 1024 * 1024,
				maxTotalSize: 0,
				tokenModel: "estimate",
				contents: true,
				followSymlinks: false,
				dryRun: false,
				encoding: "auto",
				securityPatterns: [],
				onProgress: undefined,
			},
			logger,
		);

		const { relevantSet } = await resolveRelevantFiles(scan.root, input, [
			"nonexistent.ts",
		]);

		expect(relevantSet.size).toBeGreaterThan(0);
	});

	it("resolves ESM .js import specifiers to .ts source files", async () => {
		const dir = await mkdtemp(join(tmpdir(), "fln-relevant-esm-"));
		await writeFile(
			join(dir, "package.json"),
			JSON.stringify({ name: "esm-test", version: "1.0.0" }, null, "\t"),
		);
		await mkdir(join(dir, "src"), { recursive: true });
		await writeFile(
			join(dir, "src", "index.ts"),
			[
				'import { helper } from "./helper.js";',
				"",
				"export function main(): void {",
				"  console.log(helper());",
				"}",
			].join("\n"),
		);
		await writeFile(
			join(dir, "src", "helper.ts"),
			["export function helper(): string {", "  return 'ok';", "}"].join("\n"),
		);

		const logger = createSilentLogger();
		const scan = await scanTree(
			{
				projectName: "esm-test",
				input: dir,
				exclude: [],
				include: [],
				only: [],
				onlyMode: false,
				excludedPaths: [],
				includeHidden: false,
				gitignore: true,
				maxFileSize: 10 * 1024 * 1024,
				maxTotalSize: 0,
				tokenModel: "estimate",
				contents: true,
				followSymlinks: false,
				dryRun: false,
				encoding: "auto",
				securityPatterns: [],
				onProgress: undefined,
			},
			logger,
		);

		const { relevantSet } = await resolveRelevantFiles(scan.root, dir, [
			"src/index.ts",
		]);
		expect(relevantSet.has("src/index.ts")).toBe(true);
		expect(relevantSet.has("src/helper.ts")).toBe(true);
	});
});

describe("fln --relevant end-to-end", () => {
	it("only includes transitively connected files", async () => {
		const input = await createRelevantProject();
		const outputDir = join(input, "out");
		await mkdir(outputDir, { recursive: true });

		const result = await fln({
			input,
			output: join(outputDir, "snapshot.md"),
			overwrite: true,
			relevant: ["src/index.ts"],
			logLevel: "silent",
		});

		expect(result.filesIncluded).toBe(4);
		expect(result.filesIncluded).toBeLessThan(7);
	});

	it("combines relevant with multiple seeds", async () => {
		const input = await createRelevantProject();
		const outputDir = join(input, "out");
		await mkdir(outputDir, { recursive: true });

		const result = await fln({
			input,
			output: join(outputDir, "snapshot.md"),
			overwrite: true,
			relevant: ["src/index.ts", "src/unrelated/extra.ts"],
			logLevel: "silent",
		});

		expect(result.filesIncluded).toBeGreaterThanOrEqual(5);
	});
});
