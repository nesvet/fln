#!/usr/bin/env bun

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type BenchProfile = "large" | "medium" | "small";

type ProfileSpec = {
	fileCount: number;
	avgBytes: number;
};

export const BENCH_PROFILE_SPECS: Record<BenchProfile, ProfileSpec> = {
	small: { fileCount: 500, avgBytes: 2 * 1024 },
	medium: { fileCount: 5000, avgBytes: 4 * 1024 },
	large: { fileCount: 1000, avgBytes: 500 * 1024 },
};

function fileSizeForIndex(avgBytes: number, index: number): number {
	const variation = 0.9 + (index % 21) / 100;

	return Math.max(1, Math.floor(avgBytes * variation));
}

export function isBenchProfile(value: string): value is BenchProfile {
	return value in BENCH_PROFILE_SPECS;
}

export async function createBenchFixture(
	profile: BenchProfile,
	rootDir?: string,
): Promise<string> {
	const spec = BENCH_PROFILE_SPECS[profile];
	const root =
		rootDir ?? (await mkdtemp(join(tmpdir(), `fln-bench-${profile}-`)));

	await mkdir(root, { recursive: true });
	await writeFile(
		join(root, "package.json"),
		`${JSON.stringify({ name: `fln-bench-${profile}`, version: "1.0.0" }, null, "\t")}\n`,
	);

	const padChar = "x";
	for (let index = 1; index <= spec.fileCount; index++) {
		const name = `bench-${String(index).padStart(5, "0")}.txt`;
		const bodyBytes = fileSizeForIndex(spec.avgBytes, index);
		await writeFile(join(root, name), `${padChar.repeat(bodyBytes)}\n`);
	}

	return root;
}

if (import.meta.main) {
	const profile = (process.argv[2] ?? "medium") as BenchProfile;
	if (!isBenchProfile(profile))
		throw new Error(
			`Unknown profile: ${String(profile)}. Use small, medium, or large.`,
		);

	const root = await createBenchFixture(profile);
	console.error(root);
}
