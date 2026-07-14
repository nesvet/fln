import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCliParseOptions,
	buildFlagAliasMap,
	normalizeArgv,
	parseCliArgv,
} from "../src/cli/flagsManifest.js";
import { mapCliNegationToFlnOptions } from "../src/cli/mapCliFlags.js";

describe("CLI flag aliases", () => {
	it("normalizes camelCase to canonical kebab", () => {
		const aliasMap = buildFlagAliasMap();
		expect(normalizeArgv(["--maxFileSize", "1mb"], aliasMap)).toEqual([
			"--max-file-size",
			"1mb",
		]);
		expect(normalizeArgv(["--includeHidden"], aliasMap)).toEqual([
			"--include-hidden",
		]);
		expect(normalizeArgv(["--noTree"], aliasMap)).toEqual(["--no-tree"]);
		expect(normalizeArgv(["--noContents"], aliasMap)).toEqual([
			"--no-contents",
		]);
	});

	it("parses kebab and camelCase equivalently", () => {
		const kebab = parseCliArgv(["--max-file-size", "10mb", "--dry-run"]);
		const camel = parseCliArgv(["--maxFileSize", "10mb", "--dryRun"]);
		expect(kebab.flags.maxFileSize).toBe("10mb");
		expect(camel.flags.maxFileSize).toBe("10mb");
		expect(kebab.flags.dryRun).toBe(true);
		expect(camel.flags.dryRun).toBe(true);
	});

	it("rejects unknown flag names", () => {
		expect(() => parseCliArgv(["--max-size", "1mb"])).toThrow();
	});
});

describe("CLI negation mapper", () => {
	it("maps --no-tree to tree: false", () => {
		expect(mapCliNegationToFlnOptions({ noTree: true })).toEqual({
			tree: false,
		});
		expect(mapCliNegationToFlnOptions({ noContents: true })).toEqual({
			contents: false,
		});
		expect(mapCliNegationToFlnOptions({ noGitignore: true })).toEqual({
			gitignore: false,
		});
		expect(mapCliNegationToFlnOptions({})).toEqual({});
	});
});

describe("CLI config keys", () => {
	it("rejects unknown config keys in fln.json", async () => {
		const input = mkdtempSync(join(tmpdir(), "fln-unknown-config-"));
		writeFileSync(join(input, "sample.txt"), "x\n");
		writeFileSync(
			join(input, "fln.json"),
			JSON.stringify({
				excludePatterns: ["*.txt"],
			}),
		);
		const cliPath = join(import.meta.dir, "..", "src", "cli", "index.ts");
		const proc = Bun.spawn(
			["bun", "run", cliPath, input, "--dry-run", "--quiet", "--no-ansi"],
			{
				cwd: join(import.meta.dir, ".."),
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain("Unknown config key");
		expect(stderr).toContain("excludePatterns");
		expect(stderr).not.toContain("Migrating");
		expect(stderr).not.toContain("Removed config key");
	});

	it("rejects --format text on flatten", async () => {
		const input = mkdtempSync(join(tmpdir(), "fln-format-text-"));
		writeFileSync(join(input, "sample.txt"), "x\n");
		const cliPath = join(import.meta.dir, "..", "src", "cli", "index.ts");
		const proc = Bun.spawn(
			[
				"bun",
				"run",
				cliPath,
				input,
				"--format",
				"text",
				"--dry-run",
				"--quiet",
				"--no-ansi",
			],
			{
				cwd: join(import.meta.dir, ".."),
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain("Invalid format");
		expect(stderr).toContain("md or json");
	});
});

describe("flags manifest", () => {
	it("matches parseArgs option keys", () => {
		const parseKeys = new Set(Object.keys(buildCliParseOptions()));
		const manifestKeys = new Set([
			"output",
			"exclude",
			"include",
			"only",
			"relevant",
			"stdin",
			"ext",
			"include-hidden",
			"no-gitignore",
			"max-file-size",
			"max-total-size",
			"max-tokens",
			"budget",
			"max-content-tokens",
			"token-model",
			"security-check",
			"recommend-budget",
			"http",
			"port",
			"strict-limits",
			"strict-toctou",
			"annotate-tree",
			"collect-todo",
			"compress",
			"outline",
			"diff-hunks",
			"encoding",
			"output-split",
			"no-contents",
			"no-tree",
			"format",
			"dry-run",
			"stdout",
			"copy",
			"overwrite",
			"quiet",
			"verbose",
			"debug",
			"no-ansi",
			"follow-symlinks",
			"no-sponsor-message",
			"no-local-state",
			"ignore-config",
			"date",
			"banner",
			"banner-file",
			"footer",
			"footer-file",
			"since",
			"version",
			"help",
		]);
		expect(parseKeys).toEqual(manifestKeys);
	});
});
