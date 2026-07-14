import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));

async function runFlnInProject(
	projectDirectory: string,
	homeDirectory: string,
	args: string[],
): Promise<number> {
	const proc = Bun.spawn(["bun", "run", cliPath, ...args], {
		cwd: projectDirectory,
		env: {
			...process.env,
			HOME: homeDirectory,
			FLN_NO_SPONSOR: "1",
			CI: "true",
		},
		stdout: "ignore",
		stderr: "ignore",
	});

	return proc.exited;
}

async function createMinimalProject(): Promise<string> {
	const projectDirectory = await mkdtemp(join(tmpdir(), "fln-usage-state-"));
	await writeFile(
		join(projectDirectory, "package.json"),
		JSON.stringify({ name: "usage-test", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(
		join(projectDirectory, "main.ts"),
		"export const value = 1;\n",
	);

	return projectDirectory;
}

describe("usage.json local state", () => {
	it("--no-local-state does not increment runCount", async () => {
		const homeDirectory = await mkdtemp(join(tmpdir(), "fln-usage-home-"));
		const projectDirectory = await createMinimalProject();

		const usagePath = join(homeDirectory, ".config", "fln", "usage.json");

		expect(
			await runFlnInProject(projectDirectory, homeDirectory, [
				".",
				"--dry-run",
				"--quiet",
			]),
		).toBe(0);

		const afterFirst = JSON.parse(await readFile(usagePath, "utf8")) as {
			runCount: number;
		};
		expect(afterFirst.runCount).toBe(1);

		expect(
			await runFlnInProject(projectDirectory, homeDirectory, [
				".",
				"--dry-run",
				"--quiet",
				"--no-local-state",
			]),
		).toBe(0);

		const afterSkip = JSON.parse(await readFile(usagePath, "utf8")) as {
			runCount: number;
		};
		expect(afterSkip.runCount).toBe(1);

		expect(
			await runFlnInProject(projectDirectory, homeDirectory, [
				".",
				"--dry-run",
				"--quiet",
			]),
		).toBe(0);

		const afterThird = JSON.parse(await readFile(usagePath, "utf8")) as {
			runCount: number;
		};
		expect(afterThird.runCount).toBe(2);
	});
});
