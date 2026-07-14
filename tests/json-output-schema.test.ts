import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import {
	fln,
	toFlnDiffJson,
	toFlnDoctorJson,
	toFlnPlanJson,
} from "../src/api/index.js";

const schemaDir = fileURLToPath(new URL("../schema/", import.meta.url));

async function loadSchema(name: string): Promise<object> {
	const raw = await readFile(join(schemaDir, name), "utf8");

	return JSON.parse(raw) as object;
}

function createValidator() {
	const ajv = new Ajv({ allErrors: true, strict: false });

	return ajv;
}

describe("JSON flatten output schema", () => {
	it("validates fln json output against schema/fln-output.json", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-json-schema-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "schema-test", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "src.ts"), "export const x = 1;\n");

		const outputPath = join(input, "out", "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			logLevel: "silent",
		});

		const document = JSON.parse(await readFile(outputPath, "utf8")) as object;
		const validate = createValidator().compile(
			await loadSchema("fln-output.json"),
		);
		const valid = validate(document);

		if (!valid)
			throw new Error(
				`Schema validation failed: ${JSON.stringify(validate.errors, null, "\t")}`,
			);

		expect(document).toMatchObject({
			schemaVersion: 2,
			options: { contents: true },
		});
		expect(document).toHaveProperty("root");
		expect(document).toHaveProperty("files");
	});

	it("validates annotateTree and collectTodo output", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-json-schema-annotate-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "annotate-schema", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(
			join(input, "marked.ts"),
			"// TODO: schema test\nexport const marked = 1;\n",
		);

		const outputPath = join(input, "out", "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			tree: true,
			annotateTree: "tokens",
			collectTodo: true,
			logLevel: "silent",
		});

		const document = JSON.parse(await readFile(outputPath, "utf8")) as {
			todos?: Array<{ marker: string }>;
			root: { children?: Array<{ treeAnnotation?: { tokens?: number } }> };
		};
		const validate = createValidator().compile(
			await loadSchema("fln-output.json"),
		);
		const valid = validate(document);

		if (!valid)
			throw new Error(
				`Schema validation failed: ${JSON.stringify(validate.errors, null, "\t")}`,
			);

		expect(document.todos?.some((entry) => entry.marker === "TODO")).toBe(true);
		const annotated = document.root.children?.find(
			(child) => child.treeAnnotation?.tokens !== undefined,
		);
		expect(annotated?.treeAnnotation?.tokens).toBeGreaterThan(0);
	});

	it("validates tree-only output without files array", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-json-schema-tree-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "tree-only", version: "1.0.0" }, null, "\t"),
		);
		await writeFile(join(input, "readme.txt"), "hello\n");

		const outputPath = join(input, "out", "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			contents: false,
			logLevel: "silent",
		});

		const document = JSON.parse(await readFile(outputPath, "utf8")) as Record<
			string,
			unknown
		>;
		const validate = createValidator().compile(
			await loadSchema("fln-output.json"),
		);
		const valid = validate(document);

		if (!valid)
			throw new Error(
				`Schema validation failed: ${JSON.stringify(validate.errors, null, "\t")}`,
			);

		expect(document.options).toMatchObject({ contents: false });
		expect(document).not.toHaveProperty("files");
	});

	it("rejects incomplete documents", async () => {
		const validate = createValidator().compile(
			await loadSchema("fln-output.json"),
		);

		expect(validate({ schemaVersion: 2 })).toBe(false);
		expect(validate.errors?.length).toBeGreaterThan(0);
	});
});

describe("JSON flatten output — omittedFiles", () => {
	it("emits omittedFiles with tokenLimit entries when --max-tokens is small", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-omitted-tokens-"));
		await mkdir(join(input, "src"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "omitted-tokens", version: "1.0.0" }),
		);
		await writeFile(
			join(input, "src", "a.ts"),
			`export const a = "${"x".repeat(200)}";\n`,
		);
		await writeFile(
			join(input, "src", "b.ts"),
			`export const b = "${"y".repeat(200)}";\n`,
		);
		await writeFile(
			join(input, "src", "c.ts"),
			`export const c = "${"z".repeat(200)}";\n`,
		);

		const outputPath = join(input, "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			maxTokens: 50,
			logLevel: "silent",
		});

		const doc = JSON.parse(await readFile(outputPath, "utf8")) as {
			omittedFiles?: Array<{ path: string; reason: string; size: number }>;
			omittedFilesTotal?: number;
			omittedFilesTruncated?: boolean;
		};

		expect(doc.omittedFiles).toBeDefined();
		expect(doc.omittedFilesTotal).toBeGreaterThan(0);
		expect(doc.omittedFiles?.some((o) => o.reason === "tokenLimit")).toBe(true);

		const validate = createValidator().compile(
			await loadSchema("fln-output.json"),
		);
		const valid = validate(doc);
		if (!valid)
			throw new Error(
				`Schema validation failed: ${JSON.stringify(validate.errors, null, "\t")}`,
			);
	});

	it("emits a security entry for a secret file", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-omitted-secret-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "omitted-secret", version: "1.0.0" }),
		);
		await writeFile(
			join(input, "secret.env"),
			"AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n",
		);
		await writeFile(join(input, "src.ts"), "export const x = 1;\n");

		const outputPath = join(input, "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			logLevel: "silent",
		});

		const doc = JSON.parse(await readFile(outputPath, "utf8")) as {
			omittedFiles?: Array<{ path: string; reason: string; size: number }>;
		};

		const secretEntry = doc.omittedFiles?.find((o) => o.path === "secret.env");
		expect(secretEntry).toBeDefined();
		expect(secretEntry?.reason).toBe("security");
	});

	it("omits omittedFiles field when nothing was skipped", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-omitted-none-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "omitted-none", version: "1.0.0" }),
		);
		await writeFile(join(input, "src.ts"), "export const x = 1;\n");

		const outputPath = join(input, "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			logLevel: "silent",
		});

		const doc = JSON.parse(await readFile(outputPath, "utf8")) as Record<
			string,
			unknown
		>;

		expect(doc).not.toHaveProperty("omittedFiles");
		expect(doc).not.toHaveProperty("omittedFilesTotal");
		expect(doc).not.toHaveProperty("omittedFilesTruncated");
	});

	it("caps omittedFiles at 1000 and sets truncated + total", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-omitted-cap-"));
		await mkdir(join(input, "bulk"), { recursive: true });
		await writeFile(join(input, "keep.txt"), "x");
		for (let i = 0; i <= 1000; i++)
			await writeFile(
				join(input, "bulk", `f${String(i).padStart(4, "0")}.txt`),
				`${"y".repeat(20)}\n`,
			);

		const outputPath = join(input, "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			maxFileSize: 1,
			logLevel: "silent",
		});

		const doc = JSON.parse(await readFile(outputPath, "utf8")) as {
			omittedFiles: Array<{ path: string; reason: string; size: number }>;
			omittedFilesTotal: number;
			omittedFilesTruncated?: boolean;
		};

		expect(doc.omittedFiles.length).toBe(1000);
		expect(doc.omittedFilesTotal).toBe(1001);
		expect(doc.omittedFilesTruncated).toBe(true);
	});

	it("sorts omittedFiles by size descending", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-omitted-sort-"));
		await writeFile(join(input, "keep.txt"), "x");
		await writeFile(join(input, "small.txt"), "yy\n");
		await writeFile(join(input, "big.txt"), `${"z".repeat(500)}\n`);

		const outputPath = join(input, "out.json");
		await fln({
			input,
			output: outputPath,
			overwrite: true,
			format: "json",
			maxFileSize: 1,
			logLevel: "silent",
		});

		const doc = JSON.parse(await readFile(outputPath, "utf8")) as {
			omittedFiles: Array<{ path: string; size: number }>;
		};

		const sizes = doc.omittedFiles.map((o) => o.size);
		const sorted = [...sizes].sort((a, b) => b - a);
		expect(sizes).toEqual(sorted);
	});
});

describe("JSON plan output schema", () => {
	it("validates fln plan output against schema/fln-plan.json", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-plan-schema-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "plan-test", version: "1.0.0" }),
		);
		await writeFile(join(input, "src.ts"), "export const x = 1;\n");

		const planResult = await fln.plan({
			input,
			budget: 10000,
			logLevel: "silent",
		});
		const planJson = toFlnPlanJson(planResult);

		const validate = createValidator().compile(
			await loadSchema("fln-plan.json"),
		);
		const valid = validate(planJson);

		if (!valid)
			throw new Error(
				`Plan schema validation failed: ${JSON.stringify(validate.errors, null, "\t")}`,
			);

		expect(planJson).toMatchObject({
			schemaVersion: 1,
			$schema: "https://fln.nesvet.dev/schema/plan",
		});
		expect(planJson).toHaveProperty("files");
		expect(planJson).toHaveProperty("omitted");
	});

	it("rejects incomplete plan documents", async () => {
		const validate = createValidator().compile(
			await loadSchema("fln-plan.json"),
		);

		expect(validate({ schemaVersion: 1 })).toBe(false);
		expect(validate.errors?.length).toBeGreaterThan(0);
	});
});

describe("JSON diff output schema", () => {
	it("validates fln diff output against schema/fln-diff.json", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-diff-schema-"));
		await mkdir(join(input, "out"), { recursive: true });
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "diff-test", version: "1.0.0" }),
		);
		await writeFile(join(input, "a.ts"), "export const a = 1;\n");

		const beforePath = join(input, "out", "before.md");
		const afterPath = join(input, "out", "after.md");
		await fln({
			input,
			output: beforePath,
			overwrite: true,
			logLevel: "silent",
		});
		await writeFile(join(input, "b.ts"), "export const b = 2;\n");
		await fln({
			input,
			output: afterPath,
			overwrite: true,
			logLevel: "silent",
		});

		const diffResult = await fln.diff({ before: beforePath, after: afterPath });
		const diffJson = toFlnDiffJson(diffResult);

		const validate = createValidator().compile(
			await loadSchema("fln-diff.json"),
		);
		const valid = validate(diffJson);

		if (!valid)
			throw new Error(
				`Diff schema validation failed: ${JSON.stringify(validate.errors, null, "\t")}`,
			);

		expect(diffJson).toMatchObject({
			schemaVersion: 1,
			$schema: "https://fln.nesvet.dev/schema/diff",
		});
		expect(diffJson).toHaveProperty("added");
		expect(diffJson).toHaveProperty("stats");
	});

	it("rejects incomplete diff documents", async () => {
		const validate = createValidator().compile(
			await loadSchema("fln-diff.json"),
		);

		expect(validate({ schemaVersion: 1 })).toBe(false);
		expect(validate.errors?.length).toBeGreaterThan(0);
	});
});

describe("JSON doctor output schema", () => {
	it("validates fln doctor output against schema/fln-doctor.json", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-doctor-schema-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "doctor-schema-test", version: "1.0.0" }),
		);
		await writeFile(join(input, "src.ts"), "export const x = 1;\n");

		const report = await fln.doctor({ input, logLevel: "silent" });
		const doctorJson = toFlnDoctorJson(report);

		const validate = createValidator().compile(
			await loadSchema("fln-doctor.json"),
		);
		const valid = validate(doctorJson);

		if (!valid)
			throw new Error(
				`Doctor schema validation failed: ${JSON.stringify(validate.errors, null, "\t")}`,
			);

		expect(doctorJson).toMatchObject({
			schemaVersion: 1,
			$schema: "https://fln.nesvet.dev/schema/doctor",
		});
		expect(doctorJson.scan.filesIncluded).toBeGreaterThan(0);
	});

	it("rejects incomplete doctor documents", async () => {
		const validate = createValidator().compile(
			await loadSchema("fln-doctor.json"),
		);

		expect(validate({ schemaVersion: 1 })).toBe(false);
		expect(validate.errors?.length).toBeGreaterThan(0);
	});
});
