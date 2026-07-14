import { describe, expect, it } from "bun:test";
import { buildRecommendBudget } from "../src/api/doctorRecommend.js";
import type { FileNode } from "../src/core/types.js";

function fileNode(path: string, size: number): FileNode {
	const name = path.split("/").pop() ?? path;

	return {
		type: "file",
		name,
		path,
		size,
		scanSize: size,
	};
}

describe("buildRecommendBudget", () => {
	it("returns exclude patterns when budget is exceeded", () => {
		const root: FileNode = {
			type: "directory",
			name: ".",
			path: "",
			size: 0,
			children: [
				fileNode("README.md", 100),
				fileNode("src/index.ts", 500),
				fileNode("tests/app.test.ts", 800),
			],
		};

		const result = buildRecommendBudget(root, 200, "estimate");

		expect(result.omittedCount).toBeGreaterThan(0);
		expect(result.exclude.length).toBeGreaterThan(0);
		expect(result.projectedTokens).toBeLessThanOrEqual(200);
	});

	it("omits nothing when budget fits all files", () => {
		const root: FileNode = {
			type: "directory",
			name: ".",
			path: "",
			size: 0,
			children: [fileNode("README.md", 50)],
		};

		const result = buildRecommendBudget(root, 10_000, "estimate");

		expect(result.omittedCount).toBe(0);
		expect(result.exclude).toEqual([]);
		expect(result.projectedTokens).toBeGreaterThan(0);
	});
});
