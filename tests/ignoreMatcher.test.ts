import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IgnoreMatcher } from "../src/core/index.js";

describe("IgnoreMatcher", () => {
	const input = join("/", "home", "user", "project");

	it("ignores node_modules and .git by default", () => {
		const matcher = new IgnoreMatcher({
			input,
			exclude: [],
			gitignore: false,
		});
		expect(matcher.ignores("node_modules")).toBe(true);
		expect(matcher.ignores("node_modules/foo")).toBe(true);
		expect(matcher.ignores(".git")).toBe(true);
		expect(matcher.ignores(".git/config")).toBe(true);
	});

	it("ignores fln.json and lock files by default", () => {
		const matcher = new IgnoreMatcher({
			input,
			exclude: [],
			gitignore: false,
		});
		expect(matcher.ignores("fln.json")).toBe(true);
		expect(matcher.ignores(".fln.json")).toBe(true);
		expect(matcher.ignores("package-lock.json")).toBe(true);
		expect(matcher.ignores("bun.lock")).toBe(true);
	});

	it("does not ignore regular files by default", () => {
		const matcher = new IgnoreMatcher({
			input,
			exclude: [],
			gitignore: false,
		});
		expect(matcher.ignores("src/index.ts")).toBe(false);
		expect(matcher.ignores("readme.txt")).toBe(false);
	});

	it("ignores paths matching user exclude", () => {
		const matcher = new IgnoreMatcher({
			input,
			exclude: ["*.test.ts", "dist/"],
			gitignore: false,
		});
		expect(matcher.ignores("src/foo.test.ts")).toBe(true);
		expect(matcher.ignores("dist")).toBe(true);
		expect(matcher.ignores("dist/output.js")).toBe(true);
	});

	it("ignores path with trailing slash for directory", () => {
		const matcher = new IgnoreMatcher({
			input,
			exclude: ["build"],
			gitignore: false,
		});
		expect(matcher.ignores("build/")).toBe(true);
	});

	it("ignoresSafePath returns false for null or empty", () => {
		const matcher = new IgnoreMatcher({
			input,
			exclude: [],
			gitignore: false,
		});
		expect(matcher.ignoresSafePath(null)).toBe(false);
		expect(matcher.ignoresSafePath("")).toBe(false);
	});

	it("ignoresSafePath delegates to matcher when path is valid", () => {
		const matcher = new IgnoreMatcher({
			input,
			exclude: [],
			gitignore: false,
		});
		expect(matcher.ignoresSafePath("node_modules")).toBe(true);
		expect(matcher.ignoresSafePath("src/index.ts")).toBe(false);
	});

	it("addGitignoreForDirectory loads patterns from .gitignore", async () => {
		const root = await mkdtemp(join(tmpdir(), "fln-ignore-test-"));
		const srcDir = join(root, "src");
		await mkdir(srcDir, { recursive: true });
		await writeFile(join(srcDir, ".gitignore"), "*.log\n!important.log\n");

		const matcher = new IgnoreMatcher({
			input: root,
			exclude: [],
			gitignore: true,
		});
		await matcher.addGitignoreForDirectory(srcDir);

		expect(matcher.ignores("src/debug.log")).toBe(true);
		expect(matcher.ignores("src/important.log")).toBe(false);
	});

	it("addGitignoreForDirectory does nothing when gitignore is false", async () => {
		const root = await mkdtemp(join(tmpdir(), "fln-ignore-test-"));
		const srcDir = join(root, "src");
		await mkdir(srcDir, { recursive: true });
		await writeFile(join(srcDir, ".gitignore"), "*.log\n");

		const matcher = new IgnoreMatcher({
			input: root,
			exclude: [],
			gitignore: false,
		});
		await matcher.addGitignoreForDirectory(srcDir);

		expect(matcher.ignores("src/debug.log")).toBe(false);
	});

	it("unignore exclude pattern applies after gitignore rules", async () => {
		const root = await mkdtemp(join(tmpdir(), "fln-ignore-unignore-"));
		await writeFile(join(root, ".gitignore"), "*.local.ts\n");
		await writeFile(join(root, "ignored.local.ts"), "export const x = 1;\n");

		const matcher = new IgnoreMatcher({
			input: root,
			exclude: ["!ignored.local.ts"],
			gitignore: true,
		});
		await matcher.addGitignoreForDirectory(root);

		expect(matcher.ignores("ignored.local.ts")).toBe(false);
	});

	it("addGitignoreForDirectory does not load twice for same directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "fln-ignore-test-"));
		const srcDir = join(root, "src");
		await mkdir(srcDir, { recursive: true });
		await writeFile(join(srcDir, ".gitignore"), "*.tmp\n");

		const matcher = new IgnoreMatcher({
			input: root,
			exclude: [],
			gitignore: true,
		});
		await matcher.addGitignoreForDirectory(srcDir);
		await matcher.addGitignoreForDirectory(srcDir);

		expect(matcher.ignores("src/foo.tmp")).toBe(true);
	});
});
