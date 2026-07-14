import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type UsageStats = {
	runCount: number;
	lastRun: string;
};

export type SponsorTrackingStatus = {
	enabled: boolean;
	runCount: number;
};

function getConfigDirectory(): string {
	const home = homedir();

	if (process.platform === "win32")
		return join(
			process.env.LOCALAPPDATA || join(home, "AppData", "Local"),
			"fln",
		);

	return join(home, ".config", "fln");
}

export function getUsageFilePath(): string {
	return join(getConfigDirectory(), "usage.json");
}

async function readUsageStats(): Promise<UsageStats> {
	try {
		const content = await readFile(getUsageFilePath(), "utf8");

		return JSON.parse(content) as UsageStats;
	} catch {
		return { runCount: 0, lastRun: new Date().toISOString() };
	}
}

async function writeUsageStats(stats: UsageStats): Promise<void> {
	try {
		const directory = getConfigDirectory();
		await mkdir(directory, { recursive: true });

		await writeFile(getUsageFilePath(), JSON.stringify(stats, null, "\t"));
	} catch {}
}

export async function incrementUsageCount(options?: {
	skipWrite?: boolean;
}): Promise<number> {
	const stats = await readUsageStats();
	if (options?.skipWrite) return stats.runCount;

	stats.runCount += 1;
	stats.lastRun = new Date().toISOString();
	await writeUsageStats(stats);

	return stats.runCount;
}

export async function getSponsorTrackingStatus(options?: {
	skipUsageWrite?: boolean;
	suppressSponsorMessage?: boolean;
}): Promise<SponsorTrackingStatus> {
	const stats = await readUsageStats();
	const disabled =
		Boolean(options?.skipUsageWrite) ||
		Boolean(options?.suppressSponsorMessage) ||
		process.env.FLN_NO_SPONSOR === "1";

	return {
		enabled: !disabled,
		runCount: stats.runCount,
	};
}

export function shouldShowSponsorMessage(runCount: number): boolean {
	return runCount === 5 || runCount === 25;
}
