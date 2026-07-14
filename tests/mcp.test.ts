import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ALL_TOOLS,
	handleDiff,
	handleDoctor,
	handlePlan,
	handleReadResource,
	handleSnapshot,
	handleWhy,
	RESOURCE_TEMPLATES,
	startMcpHttpServer,
} from "../src/api/mcp.js";

async function createTestProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "fln-mcp-test-"));
	await writeFile(
		join(dir, "package.json"),
		JSON.stringify({ name: "mcp-test", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(join(dir, "README.md"), "# MCP Test\n\nA test project.\n");
	await writeFile(
		join(dir, "index.ts"),
		'export function main(): void {\n\tconsole.log("hello");\n}\n',
	);
	await writeFile(join(dir, ".env"), "SECRET_KEY=abc123\n");

	return dir;
}

type ToolCallResult = {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
	structuredContent?: unknown;
};

describe("fln mcp — tool listing", () => {
	it("exposes fln_snapshot, fln_why, fln_doctor, fln_plan, fln_diff tools", () => {
		const names = ALL_TOOLS.map((t) => t.name);
		expect(names).toContain("fln_snapshot");
		expect(names).toContain("fln_why");
		expect(names).toContain("fln_doctor");
		expect(names).toContain("fln_plan");
		expect(names).toContain("fln_diff");
		expect(names.length).toBe(5);
	});

	it("each tool has name, description, and inputSchema", () => {
		for (const tool of ALL_TOOLS) {
			expect(tool.name).toBeTruthy();
			expect(tool.description).toBeTruthy();
			expect(tool.inputSchema).toBeDefined();
			expect(tool.inputSchema.type).toBe("object");
		}
	});

	it("fln_why requires 'path' parameter", () => {
		const whyTool = ALL_TOOLS.find((t) => t.name === "fln_why");
		expect(whyTool?.inputSchema.required).toContain("path");
	});
});

describe("fln mcp — fln_snapshot tool", () => {
	it("returns markdown snapshot with file contents", async () => {
		const input = await createTestProject();
		const result = (await handleSnapshot(
			{},
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		expect(result.content).toHaveLength(1);
		expect(result.content[0]?.type).toBe("text");
		const [{ text }] = result.content;
		expect(text).toContain("Codebase Snapshot: mcp-test");
		expect(text).toContain("### README.md");
		expect(text).toContain("### index.ts");
		expect(text).toContain("console.log");
	});

	it("returns JSON snapshot when format=json", async () => {
		const input = await createTestProject();
		const result = (await handleSnapshot(
			{ format: "json" },
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		const parsed = JSON.parse(text);
		expect(parsed.schemaVersion).toBe(2);
		expect(parsed.projectName).toBe("mcp-test");
		expect(parsed.root).toBeDefined();
	});

	it("supports annotateTree and collectTodo", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-mcp-annotate-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "mcp-annotate", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "todo.ts"),
			"// TODO: wire MCP\nexport const todo = true;\n",
		);

		const result = (await handleSnapshot(
			{
				collectTodo: true,
				annotateTree: "lines",
				tree: true,
			},
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		const sourceIndex = text.indexOf("## Source Files");
		const treeIndex = text.indexOf("## Directory Tree");
		const todoIndex = text.indexOf("## TODOs & Notes");
		expect(sourceIndex).toBeGreaterThanOrEqual(0);
		expect(treeIndex).toBeGreaterThan(sourceIndex);
		expect(todoIndex).toBeGreaterThan(treeIndex);
		expect(text).toContain("todo.ts:1  TODO wire MCP");
		expect(text).toMatch(/todo\.ts.*lines\)/);
	});

	it("respects exclude patterns", async () => {
		const input = await createTestProject();
		const result = (await handleSnapshot(
			{ exclude: ["*.ts"] },
			{ defaultInput: input },
		)) as ToolCallResult;

		const [{ text }] = result.content;
		expect(text).not.toContain("### index.ts");
		expect(text).toContain("### README.md");
	});

	it("respects contents=false for tree-only output", async () => {
		const input = await createTestProject();
		const result = (await handleSnapshot(
			{ contents: false },
			{ defaultInput: input },
		)) as ToolCallResult;

		const [{ text }] = result.content;
		expect(text).toContain("## Directory Tree");
		expect(text).not.toContain("## Source Files");
	});

	it("respects tree=false for contents-only output", async () => {
		const input = await createTestProject();
		const result = (await handleSnapshot(
			{ tree: false },
			{ defaultInput: input },
		)) as ToolCallResult;

		const [{ text }] = result.content;
		expect(text).not.toContain("## Directory Tree");
		expect(text).toContain("## Source Files");
	});

	it("uses input from args when provided", async () => {
		const input = await createTestProject();
		const result = (await handleSnapshot({ input }, {})) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("mcp-test");
	});

	it("skips security-sensitive files (.env) content", async () => {
		const input = await createTestProject();
		const result = (await handleSnapshot(
			{ include: [".env"], includeHidden: true },
			{ defaultInput: input },
		)) as ToolCallResult;

		const [{ text }] = result.content;
		expect(text).not.toContain("SECRET_KEY=abc123");
	});

	it("returns error for non-existent directory", async () => {
		const result = (await handleSnapshot(
			{ input: "/nonexistent/path/12345" },
			{},
		)) as ToolCallResult;

		expect(result.isError).toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("fln_snapshot failed");
	});
});

describe("fln mcp — fln_why tool", () => {
	it("explains why a normal file is included", async () => {
		const input = await createTestProject();
		const result = (await handleWhy(
			{ path: "README.md" },
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("README.md");
		expect(result.structuredContent).toBeDefined();
		const structured = result.structuredContent as {
			decision: { included: boolean };
		};
		expect(structured.decision.included).toBe(true);
	});

	it("explains why .env is excluded", async () => {
		const input = await createTestProject();
		const result = (await handleWhy(
			{ path: ".env" },
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const structured = result.structuredContent as {
			decision: { included: boolean; reason: string };
		};
		expect(structured.decision.included).toBe(false);
	});

	it("returns error when path is missing", async () => {
		const input = await createTestProject();
		const result = (await handleWhy({} as { path: string }, {
			defaultInput: input,
		})) as ToolCallResult;

		expect(result.isError).toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("fln_why failed");
	});
});

describe("fln mcp — fln_doctor tool", () => {
	it("returns doctor report with stats", async () => {
		const input = await createTestProject();
		const result = (await handleDoctor(
			{},
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("mcp-test");
		expect(text).toMatch(/files/i);
	});

	it("includes structured JSON content", async () => {
		const input = await createTestProject();
		const result = (await handleDoctor(
			{},
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.structuredContent).toBeDefined();
		const structured = result.structuredContent as {
			schemaVersion: number;
			projectName: string;
		};
		expect(structured.schemaVersion).toBe(1);
		expect(structured.projectName).toBe("mcp-test");
	});

	it("uses input from args", async () => {
		const input = await createTestProject();
		const result = (await handleDoctor({ input }, {})) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("mcp-test");
	});

	it("returns error for non-existent directory", async () => {
		const result = (await handleDoctor(
			{ input: "/nonexistent/path/12345" },
			{},
		)) as ToolCallResult;

		expect(result.isError).toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("fln_doctor failed");
	});
});

describe("fln mcp — fln_plan tool", () => {
	it("returns plan with structured content", async () => {
		const input = await createTestProject();
		const result = (await handlePlan(
			{},
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("Context Plan:");
		expect(result.structuredContent).toBeDefined();
		const structured = result.structuredContent as {
			schemaVersion: number;
			files: Array<{ path: string }>;
		};
		expect(structured.schemaVersion).toBe(1);
		expect(structured.files.some((f) => f.path === "README.md")).toBe(true);
	});

	it("respects budget argument", async () => {
		const input = await createTestProject();
		const result = (await handlePlan(
			{ budget: 50 },
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const structured = result.structuredContent as {
			budget: number;
			projectedTokens: number;
		};
		expect(structured.budget).toBe(50);
		expect(structured.projectedTokens).toBeLessThanOrEqual(50);
	});

	it("respects relevant argument", async () => {
		const input = await createTestProject();
		const result = (await handlePlan(
			{ relevant: ["index.ts"] },
			{ defaultInput: input },
		)) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const structured = result.structuredContent as {
			files: Array<{ path: string }>;
		};
		const paths = structured.files.map((f) => f.path);
		expect(paths).toContain("index.ts");
	});
});

describe("fln mcp — fln_diff tool", () => {
	async function createSnapshotFiles(): Promise<{
		beforePath: string;
		afterPath: string;
	}> {
		const dir = await mkdtemp(join(tmpdir(), "fln-mcp-diff-"));

		const beforeContent = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### index.ts",
			"```ts",
			"export function main() {}",
			"```",
			"",
		].join("\n");

		const afterContent = [
			"# Codebase Snapshot: test",
			"",
			"## Source Files",
			"",
			"### index.ts",
			"```ts",
			"export function main() { return 1; }",
			"```",
			"",
			"### new.ts",
			"```ts",
			"export const x = 1;",
			"```",
			"",
		].join("\n");

		const beforePath = join(dir, "before.md");
		const afterPath = join(dir, "after.md");
		await writeFile(beforePath, beforeContent, "utf8");
		await writeFile(afterPath, afterContent, "utf8");

		return { beforePath, afterPath };
	}

	it("returns diff with structured content", async () => {
		const { beforePath, afterPath } = await createSnapshotFiles();
		const result = (await handleDiff({
			before: beforePath,
			after: afterPath,
		})) as ToolCallResult;

		expect(result.isError).not.toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("Snapshot Diff");
		expect(result.structuredContent).toBeDefined();
		const structured = result.structuredContent as {
			schemaVersion: number;
			added: string[];
		};
		expect(structured.schemaVersion).toBe(1);
		expect(structured.added).toContain("new.ts");
	});

	it("returns error when snapshot file is missing", async () => {
		const { afterPath } = await createSnapshotFiles();
		const result = (await handleDiff({
			before: "/nonexistent/before.md",
			after: afterPath,
		})) as ToolCallResult;

		expect(result.isError).toBe(true);
		const [{ text }] = result.content;
		expect(text).toContain("fln_diff failed");
	});
});

describe("fln mcp — resource templates", () => {
	it("exposes fln_file and fln_snapshot resource templates", () => {
		const uris = RESOURCE_TEMPLATES.map(
			(t: { uriTemplate: string }) => t.uriTemplate,
		);
		expect(uris).toContain("fln_file://{path}");
		expect(uris).toContain("fln_snapshot://{name}");
	});
});

describe("fln mcp — handleReadResource", () => {
	it("throws INVALID_CONFIG for path outside input", async () => {
		const input = await createTestProject();
		await expect(
			handleReadResource("fln_file://../outside", { defaultInput: input }),
		).rejects.toMatchObject({
			code: "INVALID_CONFIG",
			name: "FlnError",
		});
	});

	it("throws INVALID_CONFIG for unknown resource URI", async () => {
		const input = await createTestProject();
		await expect(
			handleReadResource("fln_unknown://x", { defaultInput: input }),
		).rejects.toMatchObject({
			code: "INVALID_CONFIG",
			name: "FlnError",
		});
	});

	it("throws LIMIT_EXCEEDED when snapshot exceeds maxSnapshotBytes", async () => {
		const input = await createTestProject();
		await expect(
			handleReadResource("fln_snapshot://demo", {
				defaultInput: input,
				maxSnapshotBytes: 1,
			}),
		).rejects.toMatchObject({
			code: "LIMIT_EXCEEDED",
			name: "FlnError",
		});
	});

	it("reads a file under input via fln_file://", async () => {
		const input = await createTestProject();
		const result = await handleReadResource("fln_file://README.md", {
			defaultInput: input,
		});
		const [content] = result.contents;
		expect(content && "text" in content ? content.text : "").toContain(
			"MCP Test",
		);
	});
});

describe("fln mcp — HTTP transport", () => {
	it("binds and accepts HTTP on an ephemeral port", async () => {
		const input = await createTestProject();
		const handle = await startMcpHttpServer({
			defaultInput: input,
			port: 0,
		});
		try {
			expect(handle.port).toBeGreaterThan(0);
			const response = await fetch(`http://127.0.0.1:${handle.port}/`, {
				method: "GET",
			});
			// Streamable HTTP may return 4xx for bare GET — connection must succeed.
			expect(response.status).toBeGreaterThanOrEqual(200);
			expect(response.status).toBeLessThan(600);
		} finally {
			await handle.close();
		}
	});
});
