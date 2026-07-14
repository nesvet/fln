import { describe, expect, it } from "bun:test";
import * as fc from "fast-check";
import { IgnoreMatcher } from "../src/core/ignoreMatcher.js";

const safeRelativePathArb = fc
	.stringMatching(/^[a-zA-Z0-9][\w./-]{0,39}$/)
	.filter((path) => path !== "." && path !== ".." && !path.includes("/.."));

describe("property — IgnoreMatcher", () => {
	it("ignoresSafePath is boolean for safe relative paths", () => {
		fc.assert(
			fc.property(safeRelativePathArb, (safePath) => {
				const matcher = new IgnoreMatcher({
					input: "/tmp",
					exclude: [],
					gitignore: false,
				});
				expect(typeof matcher.ignoresSafePath(safePath)).toBe("boolean");
			}),
		);
	});

	it("constructor never throws on arbitrary exclude patterns", () => {
		fc.assert(
			fc.property(fc.string(), (exclude) => {
				expect(() => {
					new IgnoreMatcher({
						input: "/tmp",
						exclude: [exclude],
						gitignore: false,
					});
				}).not.toThrow();
			}),
		);
	});
});
