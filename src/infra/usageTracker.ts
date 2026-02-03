import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";


type UsageStats = {
	runCount: number;
	lastRun: string;
};

function getConfigDirectory(): string {
	const home = homedir();
	
	if (process.platform === "win32")
		return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "flatr");
	
	return join(home, ".config", "flatr");
}

function getUsageFilePath(): string {
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

export async function incrementUsageCount(): Promise<number> {
	const stats = await readUsageStats();
	stats.runCount += 1;
	stats.lastRun = new Date().toISOString();
	await writeUsageStats(stats);
	
	return stats.runCount;
}

export function shouldShowSponsorMessage(runCount: number): boolean {
	return runCount === 5 || runCount === 25;
}
