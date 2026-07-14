import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultConfigFileName } from "./defaults.js";
import { initTemplate } from "./initTemplate.js";

const mcpInitTemplate = {
	mcpServers: {
		fln: { command: "fln", args: ["mcp"] },
	},
} as const;

async function writeInitFile(
	fileName: string,
	content: string,
	overwrite: boolean,
): Promise<void> {
	const filePath = join(process.cwd(), fileName);
	try {
		await access(filePath, constants.F_OK);
		if (!overwrite) {
			console.error(
				`fln: ${fileName} already exists. Use --overwrite to replace it.`,
			);
			process.exit(1);
		}
	} catch {
		// File does not exist yet.
	}

	await writeFile(filePath, content, "utf8");
	console.info(`Created ${fileName}`);
}

export async function runInit(overwrite: boolean): Promise<void> {
	await writeInitFile(
		defaultConfigFileName,
		`${JSON.stringify(initTemplate, null, "\t")}\n`,
		overwrite,
	);
	await writeInitFile(
		".mcp.json",
		`${JSON.stringify(mcpInitTemplate, null, "\t")}\n`,
		overwrite,
	);
}
