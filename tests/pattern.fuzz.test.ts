import { describe, expect, it } from "bun:test";
import * as fc from "fast-check";
import { normalizeExcludePattern } from "../src/pattern/index.js";

describe("property — normalizeExcludePattern", () => {
	it("never throws on arbitrary strings", () => {
		fc.assert(
			fc.property(fc.string(), (pattern) => {
				expect(() => normalizeExcludePattern(pattern, "/tmp")).not.toThrow();
			}),
		);
	});
});
