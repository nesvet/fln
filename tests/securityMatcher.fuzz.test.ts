import { describe, expect, it } from "bun:test";
import * as fc from "fast-check";
import { detectSecretsInBuffer } from "../src/core/securityMatcher.js";

describe("property — detectSecretsInBuffer", () => {
	it("returns detected boolean for random buffers", () => {
		fc.assert(
			fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
				const buffer = Buffer.from(bytes);
				const result = detectSecretsInBuffer(buffer, buffer.length);
				expect(typeof result.detected).toBe("boolean");
			}),
		);
	});
});
