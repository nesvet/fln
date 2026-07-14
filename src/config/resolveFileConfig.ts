import { resolve } from "node:path";
import { defaultConfigFileName } from "./defaults.js";
import { loadConfigFile } from "./loader.js";
import { normalizeConfigFile } from "./resolver.js";

export type ResolveFileConfigOptions = {
	ignoreConfig?: boolean;
};

export type ResolvedFileConfig = {
	fileConfig: ReturnType<typeof normalizeConfigFile>;
	configPath: string;
	loaded: boolean;
	parseError?: string;
};

export async function resolveFileConfigAtInput(
	input: string,
	options: ResolveFileConfigOptions = {},
): Promise<ResolvedFileConfig> {
	const primaryPath = resolve(input, defaultConfigFileName);
	if (options.ignoreConfig)
		return { fileConfig: {}, configPath: primaryPath, loaded: false };

	const primary = await loadConfigFile(primaryPath);
	if (primary.loaded || primary.parseError)
		return {
			fileConfig: normalizeConfigFile(primary.config),
			configPath: primaryPath,
			loaded: primary.loaded,
			parseError: primary.parseError,
		};

	return { fileConfig: {}, configPath: primaryPath, loaded: false };
}
