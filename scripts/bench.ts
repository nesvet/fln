#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	type BenchProfile,
	createBenchFixture,
	isBenchProfile,
} from "./bench-fixture.js";
import { exceedsBaseline, regressionLimitMs } from "./bench-gate.js";

const projectRoot = resolve(import.meta.dir, "..");
const cliPath = join(projectRoot, "dist", "cli", "index.js");
const baselinesPath = join(projectRoot, "benchmarks", "baselines.json");

const ALL_PROFILES: BenchProfile[] = ["small", "medium", "large"];
const GATED_BASELINE_KEYS = ["medium-dry-run-ms", "medium-full-ms"] as const;
const WARMUP_RUNS = 1;
const TIMED_RUNS = 3;

type BenchScenario = {
	id: string;
	args: string[];
	baselineKey?: (typeof GATED_BASELINE_KEYS)[number];
};

const SCENARIOS: BenchScenario[] = [
	{ id: "dry-run", args: [".", "--dry-run"], baselineKey: "medium-dry-run-ms" },
	{
		id: "full",
		args: [".", "-o", "/dev/null", "--overwrite"],
		baselineKey: "medium-full-ms",
	},
	{
		id: "no-contents",
		args: [".", "-o", "/dev/null", "--overwrite", "--no-contents"],
	},
];

type BenchResultLine = {
	profile: BenchProfile;
	scenario: string;
	ms: number;
	platform: string;
};

type Baselines = Record<string, number>;

function isLinuxX64(): boolean {
	return process.platform === "linux" && process.arch === "x64";
}

function platformLabel(): string {
	return `${process.platform}-${process.arch}`;
}

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0
		? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
		: Math.round(sorted[middle]);
}

async function ensureCliBuilt(): Promise<void> {
	if (existsSync(cliPath)) return;

	const build = Bun.spawn(["bun", "run", "build:npm"], {
		cwd: projectRoot,
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await build.exited;
	if (exitCode !== 0) throw new Error("build:npm failed");
}

function runFlnOnce(fixtureRoot: string, scenarioArgs: string[]): number {
	const start = performance.now();
	const proc = Bun.spawnSync(
		["node", cliPath, ...scenarioArgs, "--quiet", "--no-ansi"],
		{
			cwd: fixtureRoot,
			env: { ...process.env, FLN_NO_SPONSOR: "1" },
			stdout: "ignore",
			stderr: "pipe",
		},
	);
	const elapsedMs = performance.now() - start;

	if (proc.exitCode !== 0) {
		const stderr = proc.stderr.toString();

		throw new Error(`fln exited ${proc.exitCode}: ${stderr}`);
	}

	return elapsedMs;
}

function measureScenario(fixtureRoot: string, scenario: BenchScenario): number {
	for (let index = 0; index < WARMUP_RUNS; index++)
		runFlnOnce(fixtureRoot, scenario.args);

	const samples: number[] = [];
	for (let index = 0; index < TIMED_RUNS; index++)
		samples.push(runFlnOnce(fixtureRoot, scenario.args));

	return median(samples);
}

function parseArgs(argv: string[]): {
	ci: boolean;
	updateBaselines: boolean;
	profiles: BenchProfile[];
} {
	const ci = argv.includes("--ci");
	const updateBaselines = argv.includes("--update-baselines");
	const profileIndex = argv.indexOf("--profile");
	let profiles: BenchProfile[] = ci ? ["medium"] : ALL_PROFILES;

	if (profileIndex !== -1) {
		const value = argv[profileIndex + 1];
		if (!value || !isBenchProfile(value))
			throw new Error("Usage: --profile small|medium|large");
		profiles = [value];
	}

	return { ci, updateBaselines, profiles };
}

async function loadBaselines(): Promise<Baselines> {
	const raw = await readFile(baselinesPath, "utf8");
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	const baselines: Baselines = {};

	for (const [key, value] of Object.entries(parsed)) {
		if (key.startsWith("_")) continue;
		if (typeof value !== "number")
			throw new Error(`Invalid baseline value for ${key}`);
		baselines[key] = value;
	}

	return baselines;
}

function emitJsonl(line: BenchResultLine): void {
	process.stdout.write(`${JSON.stringify(line)}\n`);
}

function checkRegression(
	ms: number,
	baselineKey: string,
	baselines: Baselines,
	failures: string[],
): void {
	const baseline = baselines[baselineKey];
	if (baseline === undefined) {
		failures.push(`Missing baseline key: ${baselineKey}`);

		return;
	}
	if (exceedsBaseline(ms, baseline))
		failures.push(
			`${baselineKey}: ${ms} ms > ${regressionLimitMs(baseline)} ms (baseline ${baseline} ms +10%)`,
		);
}

async function runBench(options: {
	ci: boolean;
	updateBaselines: boolean;
	profiles: BenchProfile[];
}): Promise<void> {
	await ensureCliBuilt();

	const baselines =
		options.ci || options.updateBaselines ? await loadBaselines() : {};
	const failures: string[] = [];
	const measuredForUpdate: Baselines = {};

	for (const profile of options.profiles) {
		const fixtureRoot = await mkdtemp(
			join(tmpdir(), `fln-bench-run-${profile}-`),
		);

		try {
			await createBenchFixture(profile, fixtureRoot);

			for (const scenario of SCENARIOS) {
				const ms = measureScenario(fixtureRoot, scenario);
				emitJsonl({
					profile,
					scenario: scenario.id,
					ms,
					platform: platformLabel(),
				});
				console.error(
					`${profile}/${scenario.id}: ${ms} ms (${platformLabel()})`,
				);

				if (scenario.baselineKey && profile === "medium")
					measuredForUpdate[scenario.baselineKey] = ms;

				if (
					options.ci &&
					isLinuxX64() &&
					profile === "medium" &&
					scenario.baselineKey
				)
					checkRegression(ms, scenario.baselineKey, baselines, failures);
			}
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	}

	if (options.updateBaselines) {
		if (!isLinuxX64()) throw new Error("--update-baselines requires linux-x64");

		for (const key of GATED_BASELINE_KEYS)
			if (measuredForUpdate[key] === undefined)
				throw new Error(
					`Missing measurement for ${key}; run with --profile medium`,
				);

		const payload = {
			_comment:
				"linux-x64 medians; CI fails above baseline +10%. Update with: bun run bench --profile medium --update-baselines",
			...measuredForUpdate,
		};
		await writeFile(baselinesPath, `${JSON.stringify(payload, null, "\t")}\n`);
		console.error(`Updated ${baselinesPath}`);
	}

	if (options.ci && !isLinuxX64()) {
		console.error("bench:ci regression gate skipped (linux-x64 only)");

		return;
	}

	if (failures.length > 0) {
		console.error("\nPerformance regression:");
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exit(1);
	}

	if (options.ci && isLinuxX64())
		console.error("\nPerformance benchmarks passed.");
}

if (import.meta.main) {
	const { ci, updateBaselines, profiles } = parseArgs(process.argv.slice(2));
	await runBench({ ci, updateBaselines, profiles });
}
