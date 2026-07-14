import type { FlnConfig } from "../../config/index.js";
import type { ScanResult } from "../types.js";
import { writeJson } from "./json.js";
import { writeMarkdown } from "./markdown.js";
import type { RenderLogger } from "./types.js";

export async function writeOutput(
	result: ScanResult,
	config: FlnConfig,
	logger: RenderLogger,
): Promise<void> {
	if (config.format === "json") await writeJson(result, config, logger);
	else await writeMarkdown(result, config, logger);
}
