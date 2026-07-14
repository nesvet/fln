import { describe, expect, it } from "bun:test";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tsAppRoot = fileURLToPath(new URL("../examples/ts-app", import.meta.url));

async function createRunnableTsApp(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "fln-ts-app-env-"));
	await cp(join(tsAppRoot, "src"), join(dir, "src"), { recursive: true });
	await cp(join(tsAppRoot, "package.json"), join(dir, "package.json"));
	await writeFile(join(dir, "sample.txt"), "hello\nworld\nok\n", "utf8");

	return dir;
}

async function runTsApp(
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["bun", "src/index.ts"], {
		cwd,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return { stdout, stderr, exitCode };
}

describe("examples/ts-app env hygiene", () => {
	it("prints API key configured: yes without leaking the secret", async () => {
		const cwd = await createRunnableTsApp();
		const secret = "sk-demo-not-a-real-secret";
		const { stdout, exitCode } = await runTsApp(cwd, {
			...process.env,
			API_KEY: secret,
		});

		expect(exitCode).toBe(0);
		expect(stdout).toContain("API key configured: yes");
		expect(stdout).not.toContain(secret);
	});

	it("prints API key configured: no when API_KEY is unset", async () => {
		const cwd = await createRunnableTsApp();
		const env = { ...process.env };
		delete env.API_KEY;
		const { stdout, exitCode } = await runTsApp(cwd, env);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("API key configured: no");
		expect(stdout).not.toContain("sk-demo-not-a-real-secret");
	});
});
