import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fln, formatPlanText } from "../src/api/index.js";

async function createPlanProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "fln-plan-"));
	await writeFile(
		join(dir, "package.json"),
		JSON.stringify({ name: "plan-test", version: "1.0.0" }, null, "\t"),
	);
	await writeFile(join(dir, "README.md"), "# Plan Test\n\nA test project.\n");
	await writeFile(join(dir, "LICENSE"), "MIT License\n");

	await mkdir(join(dir, "src"), { recursive: true });
	await mkdir(join(dir, "tests"), { recursive: true });

	await writeFile(
		join(dir, "src", "index.ts"),
		[
			'import { helper } from "./helper";',
			"",
			"export function main(): void {",
			"  console.log(helper());",
			"}",
		].join("\n"),
	);

	await writeFile(
		join(dir, "src", "helper.ts"),
		["export function helper(): string {", "  return 'hello';", "}"].join("\n"),
	);

	await writeFile(
		join(dir, "tests", "index.test.ts"),
		[
			'import { main } from "../src/index";',
			"",
			"it('works', () => {",
			"  expect(main).toBeDefined();",
			"});",
		].join("\n"),
	);

	return dir;
}

describe("fln.plan", () => {
	it("generates a plan with schemaVersion 1", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input });

		expect(planResult.schemaVersion).toBe(1);
		expect(planResult.input).toBe(input);
		expect(planResult.generated).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
	});

	it("includes all files when budget is 0 (unlimited)", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input, budget: 0 });

		expect(planResult.files.length).toBeGreaterThanOrEqual(4);
		expect(planResult.budget).toBe(0);
		expect(planResult.projectedTokens).toBeGreaterThan(0);
	});

	it("assigns full fidelity to README and config", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input });

		const readme = planResult.files.find((f) => f.path === "README.md");
		expect(readme?.fidelity).toBe("full");
		expect(readme?.reason).toContain("README");

		const pkg = planResult.files.find((f) => f.path === "package.json");
		expect(pkg?.fidelity).toBe("full");
		expect(pkg?.reason).toContain("config");
	});

	it("assigns compressed fidelity to test files", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input });

		const testFile = planResult.files.find(
			(f) => f.path === "tests/index.test.ts",
		);
		expect(testFile).toBeDefined();
		expect(testFile?.fidelity).toBe("compressed");
		expect(testFile?.reason).toContain("test");
	});

	it("omits LICENSE with reason", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input });

		const licenseOmitted = planResult.omitted.find((o) => o.path === "LICENSE");
		expect(licenseOmitted).toBeDefined();
		expect(licenseOmitted?.reason).toContain("boilerplate");
		expect(licenseOmitted?.savedTokens).toBeGreaterThan(0);
	});

	it("respects budget — omits files when over budget", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input, budget: 50 });

		expect(planResult.projectedTokens).toBeLessThanOrEqual(50);
		expect(planResult.omitted.length).toBeGreaterThan(0);
	});

	it("demotes to compressed when budget tight but file fits compressed", async () => {
		const input = await createPlanProject();

		const unlimitedPlan = await fln.plan({ input, budget: 0 });
		const totalTokens = unlimitedPlan.projectedTokens;

		const tightBudget = Math.ceil(totalTokens * 0.6);
		const planResult = await fln.plan({ input, budget: tightBudget });

		const hasCompressed = planResult.files.some(
			(f) => f.fidelity === "compressed",
		);
		expect(planResult.projectedTokens).toBeLessThanOrEqual(tightBudget);
		if (hasCompressed) expect(planResult.omitted.length).toBeGreaterThan(0);
	});

	it("marks seed files with 'seed file' reason", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({
			input,
			relevant: ["src/index.ts"],
		});

		const seedFile = planResult.files.find((f) => f.path === "src/index.ts");
		expect(seedFile).toBeDefined();
		expect(seedFile?.reason).toContain("seed");
	});

	it("only includes relevant files when --relevant is set", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({
			input,
			relevant: ["src/index.ts"],
		});

		const paths = planResult.files.map((f) => f.path);
		expect(paths).toContain("src/index.ts");
		expect(paths).toContain("src/helper.ts");
		expect(paths).not.toContain("tests/index.test.ts");
	});
});

describe("formatPlanText", () => {
	it("produces human-readable plan", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input, budget: 1000 });
		const text = formatPlanText(planResult);

		expect(text).toContain("Context Plan:");
		expect(text).toContain("Budget:");
		expect(text).toContain("Projected:");
		expect(text).toContain("Included files");
		expect(text).toContain("README.md");
	});

	it("shows omitted section when files are omitted", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input, budget: 50 });
		const text = formatPlanText(planResult);

		expect(text).toContain("Omitted files");
		expect(text).toContain("LICENSE");
	});

	it("handles unlimited budget", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({ input, budget: 0 });
		const text = formatPlanText(planResult);

		expect(text).toContain("unlimited");
	});

	it("uses . for Context Plan heading when input is cwd", async () => {
		const input = await createPlanProject();
		const previousCwd = process.cwd();
		try {
			process.chdir(input);
			const planResult = await fln.plan({
				input: process.cwd(),
				budget: 1000,
				logLevel: "silent",
			});
			const text = formatPlanText(planResult);
			expect(text).toContain("# Context Plan: .");
		} finally {
			process.chdir(previousCwd);
		}
	});
});

describe("fln plan — edge cases", () => {
	it("handles empty directory gracefully", async () => {
		const input = await mkdtemp(join(tmpdir(), "fln-plan-empty-"));
		await writeFile(
			join(input, "package.json"),
			JSON.stringify({ name: "empty", version: "1.0.0" }, null, "\t"),
		);

		const planResult = await fln.plan({ input });

		expect(planResult.schemaVersion).toBe(1);
		expect(planResult.files.length).toBeGreaterThanOrEqual(0);
	});

	it("respects exclude patterns", async () => {
		const input = await createPlanProject();

		const planResult = await fln.plan({
			input,
			exclude: ["*.md"],
		});

		const paths = planResult.files.map((f) => f.path);
		expect(paths).not.toContain("README.md");
	});
});

describe("fln plan — CLI (spawn)", () => {
	const cliPath = fileURLToPath(
		new URL("../src/cli/index.ts", import.meta.url),
	);

	async function runPlanSpawn(
		input: string,
		args: string[],
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		const proc = Bun.spawn(["bun", "run", cliPath, "plan", ...args], {
			cwd: input,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		return {
			stdout: stdout.trim(),
			stderr: stderr.trim(),
			exitCode: await proc.exited,
		};
	}

	it("prints human-readable plan text", async () => {
		const input = await createPlanProject();
		const { stdout, exitCode } = await runPlanSpawn(input, [
			"--stdout",
			"--no-ansi",
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Context Plan:");
		expect(stdout).toContain("Budget:");
		expect(stdout).toContain("Projected:");
	});

	it("prints JSON plan with --format json", async () => {
		const input = await createPlanProject();
		const { stdout, exitCode } = await runPlanSpawn(input, [
			"--format",
			"json",
			"--stdout",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as {
			schemaVersion: number;
			files: Array<{ path: string }>;
		};

		expect(exitCode).toBe(0);
		expect(payload.schemaVersion).toBe(1);
		expect(payload.files.some((f) => f.path === "README.md")).toBe(true);
	});

	it("respects --max-tokens budget flag", async () => {
		const input = await createPlanProject();
		const { stdout, exitCode } = await runPlanSpawn(input, [
			"--max-tokens",
			"50",
			"--format",
			"json",
			"--stdout",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as {
			budget: number;
			projectedTokens: number;
		};

		expect(exitCode).toBe(0);
		expect(payload.budget).toBe(50);
		expect(payload.projectedTokens).toBeLessThanOrEqual(50);
	});

	it("accepts --budget as an alias for --max-tokens", async () => {
		const input = await createPlanProject();
		const { stdout, exitCode } = await runPlanSpawn(input, [
			"--budget",
			"50",
			"--format",
			"json",
			"--stdout",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as {
			budget: number;
			projectedTokens: number;
		};

		expect(exitCode).toBe(0);
		expect(payload.budget).toBe(50);
	});

	it("respects --relevant flag", async () => {
		const input = await createPlanProject();
		const { stdout, exitCode } = await runPlanSpawn(input, [
			"--relevant",
			"src/index.ts",
			"--format",
			"json",
			"--stdout",
			"--no-ansi",
		]);
		const payload = JSON.parse(stdout) as { files: Array<{ path: string }> };

		expect(exitCode).toBe(0);
		const paths = payload.files.map((f) => f.path);
		expect(paths).toContain("src/index.ts");
		expect(paths).not.toContain("tests/index.test.ts");
	});

	it("writes plan to file with -o", async () => {
		const input = await createPlanProject();
		const outputPath = join(input, "plan.md");
		const { exitCode } = await runPlanSpawn(input, [
			"-o",
			outputPath,
			"--no-ansi",
		]);
		const output = await readFile(outputPath, "utf8");

		expect(exitCode).toBe(0);
		expect(output).toContain("Context Plan:");
	});
});
