import { readFile } from "node:fs/promises";
import type { RawConfigFile } from "./types";


export async function loadConfigFile(configPath: string): Promise<RawConfigFile> {
	try {
		const content = await readFile(configPath, "utf8");
		const parsed = JSON.parse(content) as RawConfigFile;
		
		return parsed;
	} catch {
		return {};
	}
}
