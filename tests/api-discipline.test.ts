import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("check:api-discipline", () => {
	it("exits 0 on the current tree", async () => {
		const proc = Bun.spawn(["bun", "run", "check:api-discipline"], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		expect(exitCode).toBe(0);
	});
});

describe("check:dist", () => {
	it("exits 0 after a clean build:npm", async () => {
		const build = Bun.spawn(["bun", "run", "build:npm"], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await build.exited).toBe(0);

		const check = Bun.spawn(["bun", "run", "check:dist"], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await check.exited).toBe(0);
	});

	it("fails when dist contains an orphan emit", async () => {
		const orphanJs = join(root, "dist", "orphan-legacy.js");
		await Bun.write(orphanJs, "export {};\n");
		try {
			const check = Bun.spawn(["bun", "run", "check:dist"], {
				cwd: root,
				stdout: "pipe",
				stderr: "pipe",
			});
			const stderr = await new Response(check.stderr).text();
			expect(await check.exited).toBe(1);
			expect(stderr).toContain("orphan-legacy.js");
		} finally {
			await Bun.$`rm -f ${orphanJs}`;
		}
	});
});
