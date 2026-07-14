import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isPathInsideRoot,
	shouldFollowSymlinks,
} from "../src/core/scan/symlinkPolicy.js";

describe("symlinkPolicy", () => {
	it("shouldFollowSymlinks is true for true and in-root-only", () => {
		expect(shouldFollowSymlinks(true)).toBe(true);
		expect(shouldFollowSymlinks("in-root-only")).toBe(true);
		expect(shouldFollowSymlinks(false)).toBe(false);
	});

	it("isPathInsideRoot accepts paths under root", async () => {
		const root = await mkdtemp(join(tmpdir(), "fln-symlink-root-"));
		const nested = join(root, "nested");
		await mkdir(nested, { recursive: true });

		expect(isPathInsideRoot(nested, root)).toBe(true);
		expect(isPathInsideRoot(root, root)).toBe(true);
		expect(isPathInsideRoot(tmpdir(), root)).toBe(false);
	});

	it("isPathInsideRoot rejects symlink target outside root", async () => {
		const root = await mkdtemp(join(tmpdir(), "fln-symlink-escape-"));
		const outside = await mkdtemp(join(tmpdir(), "fln-symlink-outside-"));
		const linkPath = join(root, "escape");
		await symlink(outside, linkPath, "dir");

		const { realpath } = await import("node:fs/promises");
		const resolved = await realpath(linkPath);
		expect(isPathInsideRoot(resolved, root)).toBe(false);
	});
});
