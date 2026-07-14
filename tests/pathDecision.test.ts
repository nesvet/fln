import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { explainPath } from "../src/core/pathDecision.js";

describe("explainPath", () => {
	it("reports hidden for dotfiles without include-hidden", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-why-hidden-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "why", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".flnrc"), "x\n");

		const decision = await explainPath({
			input,
			relativePath: ".flnrc",
			exclude: [],
			include: [],
			only: [],
			onlyMode: false,
			includeHidden: false,
			gitignore: false,
			maxFileSize: 10 * 1024 * 1024,
			securityPatterns: [],
		});

		expect(decision.included).toBe(false);
		expect(decision.reason).toBe("hidden");
	});

	it("reports defaultIgnore for .env before hidden", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-why-env-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "why", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".env"), "SECRET=1\n");

		const decision = await explainPath({
			input,
			relativePath: ".env",
			exclude: [],
			include: [],
			only: [],
			onlyMode: false,
			includeHidden: false,
			gitignore: false,
			maxFileSize: 10 * 1024 * 1024,
			securityPatterns: [],
		});

		expect(decision.included).toBe(false);
		expect(decision.reason).toBe("defaultIgnore");
	});

	it("reports forceInclude for -i dotfile", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-why-force-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "why", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".flnrc"), "x\n");

		const decision = await explainPath({
			input,
			relativePath: ".flnrc",
			exclude: [],
			include: [".flnrc"],
			only: [],
			onlyMode: false,
			includeHidden: false,
			gitignore: false,
			maxFileSize: 10 * 1024 * 1024,
			securityPatterns: [],
		});

		expect(decision.included).toBe(true);
		expect(decision.reason).toBe("forceInclude");
	});

	it("reports unignore via exclude negation after gitignore", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-why-unignore-"));
		await writeFile(join(input, ".gitignore"), "*.local.ts\n");
		await writeFile(join(input, "ignored.local.ts"), "x\n");

		const decision = await explainPath({
			input,
			relativePath: "ignored.local.ts",
			exclude: ["!ignored.local.ts"],
			include: [],
			only: [],
			onlyMode: false,
			includeHidden: false,
			gitignore: true,
			maxFileSize: 10 * 1024 * 1024,
			securityPatterns: [],
		});

		expect(decision.included).toBe(true);
	});
});
