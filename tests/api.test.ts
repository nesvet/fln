import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlnError, fln, VERSION } from "../src/api/index.js";
import { collectSkipReasonCounts } from "../src/core/render/index.js";
import type { FileNode } from "../src/core/types.js";

function findFileNode(
	root: FileNode,
	relativePath: string,
): FileNode | undefined {
	if (root.path === relativePath) return root;

	for (const child of root.children ?? []) {
		const found = findFileNode(child, relativePath);
		if (found) return found;
	}

	return undefined;
}

describe("fln API", () => {
	it("processes project and returns FlnResult", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-api-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "api-test", version: "1.0.0" }, null, "\t"),
		);
		await mkdir(join(input, "src"), { recursive: true });
		await writeFile(join(input, "src/index.ts"), "export const x = 1;\n");

		const output = join(input, "out.md");
		const result = await fln({
			input,
			output,
			contents: true,
			tree: true,
		});

		expect(result.projectName).toBe("api-test");
		expect(result.filesIncluded).toBeGreaterThanOrEqual(1);
		expect(result.outputPath).toBe(output);
		expect(result.outputTokenCount).toBeGreaterThan(0);
		expect(result.outputSizeBytes).toBeGreaterThan(0);
		expect("files" in result).toBe(false);
		expect("_root" in result).toBe(false);

		const content = await readFile(output, "utf8");
		expect(content).toContain("src/index.ts");
		expect(content).toContain("export const x = 1");
	});

	it("exports VERSION matching package", async () => {
		const packageJson = await import("../package.json");
		expect(VERSION).toBe(packageJson.default.version);
	});

	it("fln.inspect rejects copy", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-inspect-copy-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "no-copy", version: "1.0.0" }, null, "\t"),
		);

		try {
			await expect(
				fln.inspect({ input, copy: true, logLevel: "silent" }),
			).rejects.toMatchObject({
				code: "INVALID_CONFIG",
			} satisfies Partial<FlnError>);
		} finally {
			const { rm } = await import("node:fs/promises");
			await rm(input, { recursive: true, force: true });
		}
	});

	it("fln.inspect returns tree without writing output", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-inspect-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "inspect-test", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "sample.ts"), "export const a = 1;\n");
		const output = join(input, "would-be-out.md");

		const inspected = await fln.inspect({
			input,
			output,
			logLevel: "silent",
		});

		expect(inspected.projectName).toBe("inspect-test");
		expect(inspected.root.type).toBe("directory");
		expect(findFileNode(inspected.root, "sample.ts")).toBeDefined();
		expect(inspected.stats.filesIncluded).toBeGreaterThan(0);

		await expect(readFile(output, "utf8")).rejects.toThrow();
	});

	it("throws FlnError when no files are included", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-api-empty-"));

		try {
			await fln({ input, logLevel: "silent" });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(FlnError);
			expect((error as FlnError).code).toBe("NO_FILES_INCLUDED");
			expect((error as FlnError).hint).toContain("--include-hidden");
		}
	});

	it("fln.inspect exposes skipReason on security paths", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-inspect-security-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "sec-inspect", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, ".env"), "SECRET=1\n");
		await writeFile(join(input, "ok.txt"), "ok\n");

		const inspected = await fln.inspect({
			input,
			include: [".env"],
			format: "json",
			logLevel: "silent",
		});

		const envNode = findFileNode(inspected.root, ".env");
		expect(envNode?.skipReason).toBe("security");

		const skipCounts = collectSkipReasonCounts(inspected.root);
		expect(skipCounts.get("security")).toBeGreaterThanOrEqual(1);
	});
});
