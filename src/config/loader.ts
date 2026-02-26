import { readFile } from "node:fs/promises";
import type { RawConfigFile } from "./types.js";


export type LoadConfigResult = {
	config: RawConfigFile;
	loaded: boolean;
	parseError?: string;
};

export async function loadConfigFile(configPath: string): Promise<LoadConfigResult> {
	try {
		const content = await readFile(configPath, "utf8");
		const { $schema: _, ...parsed } = JSON.parse(content) as RawConfigFile;
		
		return { config: parsed, loaded: true };
	} catch (error) {
		const typedError = error as { code?: string; message?: string };
		if (typedError.code === "ENOENT")
			return { config: {}, loaded: false };
		
		const message = error instanceof SyntaxError ?
			`Invalid JSON in ${configPath}: ${error.message}` :
			`Failed to load ${configPath}: ${typedError.message}`;
		
		return { config: {}, loaded: false, parseError: message };
	}
}
