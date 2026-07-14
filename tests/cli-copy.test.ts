import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	validateCopyOptions,
	validateFormatOptions,
} from "../src/api/pipeline.js";
import { runCommandLine } from "../src/cli/commandLine.js";
import { FlnError } from "../src/infra/flnError.js";

const cliEntryPath = fileURLToPath(
	new URL("../src/cli/index.ts", import.meta.url),
);

async function runCliExpectError(
	rootDirectory: string,
	args: string[],
): Promise<FlnError> {
	const previousCwd = process.cwd();
	const previousArgv = [...process.argv];

	try {
		process.chdir(rootDirectory);
		process.argv = [previousArgv[0] ?? "node", cliEntryPath, ...args];
		await runCommandLine();

		throw new Error("Expected runCommandLine to throw");
	} catch (error) {
		if (!(error instanceof FlnError)) throw error;

		return error;
	} finally {
		process.chdir(previousCwd);
		process.argv = previousArgv;
	}
}

async function createMinimalProject(): Promise<string> {
	const rootDirectory = await mkdtemp(join(tmpdir(), "fln-cli-copy-"));
	await writeFile(
		join(rootDirectory, "package.json"),
		JSON.stringify({ name: "copy-test", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(join(rootDirectory, "readme.txt"), "ok\n");

	return rootDirectory;
}

describe("validateCopyOptions", () => {
	it("allows copy alone", () => {
		expect(() => validateCopyOptions({ copy: true })).not.toThrow();
	});

	it("rejects copy with dry-run", () => {
		expect(() => validateCopyOptions({ copy: true, dryRun: true })).toThrow(
			FlnError,
		);
		try {
			validateCopyOptions({ copy: true, dryRun: true });
		} catch (error) {
			expect(error).toBeInstanceOf(FlnError);
			expect((error as FlnError).code).toBe("INVALID_CONFIG");
		}
	});

	it("rejects copy with output path", () => {
		expect(() =>
			validateCopyOptions({
				copy: true,
				output: "./out.md",
			}),
		).toThrow(FlnError);
	});

	it("rejects copy with output-split greater than 1", () => {
		expect(() =>
			validateCopyOptions({
				copy: true,
				outputSplit: 2,
			}),
		).toThrow(FlnError);
	});

	it("rejects copy with explicit stdout output", () => {
		expect(() =>
			validateCopyOptions({
				copy: true,
				output: "-",
			}),
		).toThrow(FlnError);
	});
});

describe("validateFormatOptions", () => {
	it("allows md with output-split", () => {
		expect(() => validateFormatOptions("md", 1)).not.toThrow();
		expect(() => validateFormatOptions("md", 3)).not.toThrow();
	});

	it("allows json with output-split 1", () => {
		expect(() => validateFormatOptions("json", 1)).not.toThrow();
	});

	it("rejects json with output-split greater than 1", () => {
		expect(() => validateFormatOptions("json", 2)).toThrow(FlnError);
		try {
			validateFormatOptions("json", 2);
		} catch (error) {
			expect(error).toBeInstanceOf(FlnError);
			expect((error as FlnError).code).toBe("INVALID_CONFIG");
			expect((error as FlnError).message).toContain("--output-split");
		}
	});
});

describe("CLI copy conflicts", () => {
	it("rejects --copy with --stdout as FlnError", async () => {
		const rootDirectory = await createMinimalProject();
		const error = await runCliExpectError(rootDirectory, [
			"--copy",
			"--stdout",
			"--quiet",
			"--no-ansi",
		]);

		expect(error.code).toBe("INVALID_CONFIG");
		expect(error.message).toContain("--copy");
	});

	it("rejects --copy with -o as FlnError", async () => {
		const rootDirectory = await createMinimalProject();
		const error = await runCliExpectError(rootDirectory, [
			"--copy",
			"-o",
			"out.md",
			"--quiet",
			"--no-ansi",
		]);

		expect(error.code).toBe("INVALID_CONFIG");
		expect(error.message).toContain("--copy");
	});
});
