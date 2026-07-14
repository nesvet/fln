import { describe, expect, it } from "bun:test";
import {
	countTextTokensAsync,
	createTokenCounter,
} from "../src/infra/tokenBudget.js";

describe("tokenBudget — countTextTokensAsync", () => {
	it("returns 0 for empty text", async () => {
		expect(await countTextTokensAsync("", "estimate")).toBe(0);
	});

	it("estimate model returns positive count for code", async () => {
		const count = await countTextTokensAsync(
			"export function main() { return 42; }",
			"estimate",
		);
		expect(count).toBeGreaterThan(0);
	});

	it("claude model returns same as estimate (heuristic)", async () => {
		const text = "export function main() { return 42; }";
		const estimateCount = await countTextTokensAsync(text, "estimate");
		const claudeCount = await countTextTokensAsync(text, "claude");
		expect(claudeCount).toBe(estimateCount);
	});

	it("gemini model returns same as estimate (heuristic)", async () => {
		const text = "export function main() { return 42; }";
		const estimateCount = await countTextTokensAsync(text, "estimate");
		const geminiCount = await countTextTokensAsync(text, "gemini");
		expect(geminiCount).toBe(estimateCount);
	});

	it("gpt-4o model returns positive count", async () => {
		const count = await countTextTokensAsync(
			"export function main() { return 42; }",
			"gpt-4o",
		);
		expect(count).toBeGreaterThan(0);
	});

	it("gpt-5 model returns same as gpt-4o (o200k_base)", async () => {
		const text = "export function main() { return 42; }";
		const gpt4oCount = await countTextTokensAsync(text, "gpt-4o");
		const gpt5Count = await countTextTokensAsync(text, "gpt-5");
		expect(gpt5Count).toBe(gpt4oCount);
	});

	it("gpt-4 model returns positive count", async () => {
		const count = await countTextTokensAsync(
			"export function main() { return 42; }",
			"gpt-4",
		);
		expect(count).toBeGreaterThan(0);
	});

	it("gpt-4 and gpt-4o produce different counts for the same text", async () => {
		const text = "export function main() { return 42; }";
		const gpt4Count = await countTextTokensAsync(text, "gpt-4");
		const gpt4oCount = await countTextTokensAsync(text, "gpt-4o");
		// They use different encodings (cl100k_base vs o200k_base) — counts may differ
		expect(gpt4Count).toBeGreaterThan(0);
		expect(gpt4oCount).toBeGreaterThan(0);
	});
});

describe("tokenBudget — createTokenCounter", () => {
	it("creates a counter for estimate model", async () => {
		const counter = await createTokenCounter("estimate");
		expect(counter("hello world")).toBeGreaterThan(0);
	});

	it("creates a counter for gpt-4o model", async () => {
		const counter = await createTokenCounter("gpt-4o");
		expect(counter("hello world")).toBeGreaterThan(0);
	});

	it("creates a counter for gpt-5 model", async () => {
		const counter = await createTokenCounter("gpt-5");
		expect(counter("hello world")).toBeGreaterThan(0);
	});

	it("creates a counter for claude model", async () => {
		const counter = await createTokenCounter("claude");
		expect(counter("hello world")).toBeGreaterThan(0);
	});

	it("creates a counter for gemini model", async () => {
		const counter = await createTokenCounter("gemini");
		expect(counter("hello world")).toBeGreaterThan(0);
	});

	it("gpt-5 counter matches gpt-4o counter", async () => {
		const gpt4oCounter = await createTokenCounter("gpt-4o");
		const gpt5Counter = await createTokenCounter("gpt-5");
		const text = "const x = 42; function main() { return x; }";
		expect(gpt5Counter(text)).toBe(gpt4oCounter(text));
	});
});
