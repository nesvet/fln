import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";
import {
	MAX_TODO_ENTRIES,
	TodoCollector,
} from "../src/core/render/todoCollector.js";

describe("--collect-todo", () => {
	it("collects TODO markers with owner into markdown section", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-collect-todo-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "collect-todo", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "notes.ts"),
			"// TODO(alice): ship feature\nexport const x = 1;\n",
		);

		const output = join(input, "out.md");
		await fln({
			input,
			output,
			overwrite: true,
			tree: false,
			collectTodo: true,
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const content = await readFile(output, "utf8");
		expect(content).toContain("## TODOs & Notes");
		expect(content).toContain("notes.ts:1  TODO(alice) ship feature");
	});

	it("collects markers in compress mode during the same read", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-collect-todo-compress-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify(
				{ name: "collect-compress", version: "1.0.0" },
				null,
				"\t",
			),
		);
		await writeFile(
			join(input, "worker.ts"),
			"// FIXME: optimize loop\nexport function work() {}\n",
		);

		const output = join(input, "out.md");
		await fln({
			input,
			output,
			overwrite: true,
			tree: false,
			compress: true,
			collectTodo: true,
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const content = await readFile(output, "utf8");
		expect(content).toContain("worker.ts:1  FIXME optimize loop");
	});

	it("collects markers in outline mode during the same read", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-collect-todo-outline-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "collect-outline", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "api.ts"),
			"// FIXME: handle errors\nexport function api() {}\n",
		);

		const output = join(input, "out.md");
		await fln({
			input,
			output,
			overwrite: true,
			tree: false,
			outline: true,
			collectTodo: true,
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const content = await readFile(output, "utf8");
		expect(content).toContain("api.ts:1  FIXME handle errors");
	});

	it("omits todo section when no markers are found", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-collect-todo-empty-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "collect-empty", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "clean.ts"), "export const clean = true;\n");

		const output = join(input, "out.md");
		await fln({
			input,
			output,
			overwrite: true,
			tree: false,
			collectTodo: true,
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const content = await readFile(output, "utf8");
		expect(content).not.toContain("## TODOs & Notes");
	});

	it("JSON output includes todos array", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-collect-todo-json-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "collect-json", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "warn.ts"),
			"// WARN: flaky test\nexport {};\n",
		);

		const output = join(input, "out.json");
		await fln({
			input,
			output,
			overwrite: true,
			format: "json",
			tree: false,
			collectTodo: true,
			date: "2026-01-01 00:00",
			logLevel: "silent",
		});

		const parsed = JSON.parse(await readFile(output, "utf8")) as {
			todos?: Array<{ marker: string; file: string }>;
		};
		expect(parsed.todos?.some((entry) => entry.marker === "WARN")).toBe(true);
	});

	it("caps todo entries at MAX_TODO_ENTRIES", () => {
		const collector = new TodoCollector();
		for (let index = 0; index < MAX_TODO_ENTRIES + 5; index++)
			collector.scanLine(`// TODO item ${index}`, "file.ts", index + 1);

		expect(collector.getEntries()).toHaveLength(MAX_TODO_ENTRIES);
		expect(collector.truncated).toBe(true);
	});
});
