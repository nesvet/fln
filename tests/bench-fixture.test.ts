import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createBenchFixture,
	isBenchProfile,
} from "../scripts/bench-fixture.js";
import { exceedsBaseline, regressionLimitMs } from "../scripts/bench-gate.js";

describe("bench fixture", () => {
	it("creates small profile with 500 bench files and package.json", async () => {
		const root = await mkdtemp(join(tmpdir(), "fln-bench-fixture-test-"));

		try {
			await createBenchFixture("small", root);
			const entries = await readdir(root);
			const benchFiles = entries.filter(
				(name) => name.startsWith("bench-") && name.endsWith(".txt"),
			);
			expect(benchFiles).toHaveLength(500);
			expect(entries).toContain("package.json");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("recognizes bench profile names", () => {
		expect(isBenchProfile("medium")).toBe(true);
		expect(isBenchProfile("xlarge")).toBe(false);
	});
});

describe("bench regression gate", () => {
	it("fails when ms exceeds baseline +10%", () => {
		expect(exceedsBaseline(1101, 1000)).toBe(true);
		expect(exceedsBaseline(1100, 1000)).toBe(false);
		expect(exceedsBaseline(1000, 1000)).toBe(false);
	});

	it("computes regression limit for messages", () => {
		expect(regressionLimitMs(1000)).toBe(1100);
	});
});
