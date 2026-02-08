import { loadConfig } from "./config";
import { formatReport } from "./formatter";
import { buildReport } from "./processor";
import { readLines } from "./reader";

async function main(): Promise<void> {
	const config = loadConfig();
	const lines = await readLines(config.inputPath);
	console.log(formatReport(buildReport(config.projectName, lines, config.minLineLength)));
}

void main();
