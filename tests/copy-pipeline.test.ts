import { afterEach, describe, expect, it } from "bun:test";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fln } from "../src/api/index.js";
import { setCopyTempDirectoryTrackerForTests } from "../src/api/pipeline.js";
import { setClipboardCopyRunnerForTests } from "../src/infra/clipboard.js";
import type { FlnError } from "../src/infra/flnError.js";

afterEach(() => {
	setCopyTempDirectoryTrackerForTests(undefined);
	setClipboardCopyRunnerForTests(undefined);
});

async function createMinimalProject(): Promise<string> {
	const input = await mkdtemp(join(tmpdir(), "fln-copy-pipeline-"));
	await writeFile(
		join(input, "package.json"),
		JSON.stringify({ name: "copy-pipeline", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(join(input, "readme.txt"), "hello\n");

	return input;
}

describe("copy pipeline", () => {
	it("removes temp directory after successful copy", async () => {
		const input = await createMinimalProject();
		let trackedTempDirectory: string | undefined;

		setClipboardCopyRunnerForTests(() => Promise.resolve());
		setCopyTempDirectoryTrackerForTests((path) => {
			trackedTempDirectory = path;
		});

		const result = await fln({ input, copy: true, logLevel: "silent" });

		expect(trackedTempDirectory).toBeDefined();
		expect(result.outputPath).toBe("");
		if (!trackedTempDirectory) throw new Error("missing temp directory");
		await expect(access(trackedTempDirectory)).rejects.toThrow();
	});

	it("removes temp directory when clipboard copy fails", async () => {
		const input = await createMinimalProject();
		let trackedTempDirectory: string | undefined;

		setClipboardCopyRunnerForTests(() =>
			Promise.reject(new Error("clipboard failed")),
		);
		setCopyTempDirectoryTrackerForTests((path) => {
			trackedTempDirectory = path;
		});

		await expect(
			fln({ input, copy: true, logLevel: "silent" }),
		).rejects.toMatchObject({
			code: "CLIPBOARD_UNAVAILABLE",
		} satisfies Partial<FlnError>);

		expect(trackedTempDirectory).toBeDefined();
		if (!trackedTempDirectory) throw new Error("missing temp directory");
		await expect(access(trackedTempDirectory)).rejects.toThrow();
	});
});
