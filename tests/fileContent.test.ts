import { describe, expect, it } from "bun:test";
import {
	computeMaxBacktickRun,
	maxBacktickSampleBytes,
} from "../src/core/fileContent.js";
import { getFenceLength } from "../src/core/render/markdown.js";
import type { FileNode } from "../src/core/types.js";

function makeNode(size: number, maxBacktickRun?: number): FileNode {
	return {
		name: "test.ts",
		path: "test.ts",
		type: "file",
		size,
		maxBacktickRun,
	};
}

describe("computeMaxBacktickRun", () => {
	it("returns 0 for text without backticks", () => {
		expect(computeMaxBacktickRun("hello")).toBe(0);
	});

	it("returns longest consecutive backtick run", () => {
		expect(computeMaxBacktickRun("a ``` b ```` c")).toBe(4);
	});
});

describe("getFenceLength", () => {
	it("returns 3 for small file with no backticks", () => {
		expect(getFenceLength(makeNode(100, 0))).toBe(3);
	});

	it("returns 4 for small file with 3 backticks", () => {
		expect(getFenceLength(makeNode(100, 3))).toBe(4);
	});

	it("returns 6 for small file with 5 backticks", () => {
		expect(getFenceLength(makeNode(100, 5))).toBe(6);
	});

	it("adds safety margin for files larger than backtick sample", () => {
		const largeSize = maxBacktickSampleBytes + 1;
		expect(getFenceLength(makeNode(largeSize, 0))).toBe(4);
		expect(getFenceLength(makeNode(largeSize, 3))).toBe(5);
		expect(getFenceLength(makeNode(largeSize, 5))).toBe(7);
	});

	it("does not add safety margin for files at exactly sample size", () => {
		expect(getFenceLength(makeNode(maxBacktickSampleBytes, 0))).toBe(3);
	});
});
