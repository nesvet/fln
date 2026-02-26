import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultConfigFileName } from "./defaults.js";


const SCHEMA_URL = "https://fln.nesvet.dev/schema";

const initTemplate = {
	$schema: SCHEMA_URL,
	output: "output.md",
	excludePatterns: [] as string[],
	includePatterns: [] as string[],
	gitignore: true,
	includeHidden: false,
	maxFileSize: "10mb",
	maxTotalSize: "0",
	includeTree: true,
	includeContents: true,
	format: "md",
	followSymlinks: false,
	overwrite: false
};

export async function runInit(overwrite: boolean): Promise<void> {
	const configPath = resolve(process.cwd(), defaultConfigFileName);
	
	if (!overwrite)
		try {
			await access(configPath);
			console.error(`fln: ${defaultConfigFileName} already exists. Use --overwrite to replace.`);
			process.exit(1);
		} catch {}
	
	
	const content = `${JSON.stringify(initTemplate, null, "\t")}\n`;
	await writeFile(configPath, content);
	console.info(`✓ Created ${defaultConfigFileName}`);
}
