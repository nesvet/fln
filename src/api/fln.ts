import { relative, resolve, sep } from "node:path";
import {
	defaultConfigFileName,
	getProjectMetadata,
	loadConfigFile,
	normalizeConfigFile,
	resolveConfig,
	resolveOutputPath
} from "../config/index.js";
import { parseByteSize, scanTree, writeOutput } from "../core/index.js";
import { createLogger } from "../infra/index.js";
import type { FlnOptions, FlnResult } from "./types.js";

/**
 * Flatten your codebase into a single AI-ready file
 *
 * @example
 * ```typescript
 * import { fln } from "fln";
 *
 * const result = await fln({
 *   rootDirectory: "./src",
 *   outputFile: "output.md",
 *   excludePatterns: ["*.test.ts"],
 *   onProgress: (current, total) => {
 *     console.log(`Progress: ${current}/${total}`);
 *   }
 * });
 *
 * console.log(`Processed ${result.files} files`);
 * console.log(`Output: ${result.outputPath}`);
 * console.log(`Tokens: ${result.outputTokenCount}`);
 * ```
 */
export async function fln(options: FlnOptions = {}): Promise<FlnResult> {
	const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
	
	const projectMetadata = await getProjectMetadata(rootDirectory);
	
	const configFilePath = resolve(rootDirectory, defaultConfigFileName);
	
	const fileConfig = normalizeConfigFile(await loadConfigFile(configFilePath));
	
	const format: "json" | "md" = options.format ?? (fileConfig.format as "json" | "md" | undefined) ?? "md";
	const overwrite = options.overwrite ?? fileConfig.overwrite ?? false;
	
	const outputValue = options.outputFile ?? fileConfig.outputFile;
	const outputFile = await resolveOutputPath(
		outputValue ? resolve(outputValue) : undefined,
		rootDirectory,
		overwrite,
		format
	);
	
	const userConfig = {
		outputFile,
		overwrite: options.overwrite,
		excludePatterns: options.excludePatterns,
		includePatterns: options.includePatterns,
		includeHidden: options.includeHidden,
		useGitignore: options.useGitignore,
		maximumFileSizeBytes: typeof options.maximumFileSizeBytes === "string" ?
			parseByteSize(options.maximumFileSizeBytes) :
			options.maximumFileSizeBytes,
		maximumTotalSizeBytes: typeof options.maximumTotalSizeBytes === "string" ?
			parseByteSize(options.maximumTotalSizeBytes) :
			options.maximumTotalSizeBytes,
		includeContents: options.includeContents,
		includeTree: options.includeTree,
		format,
		followSymlinks: options.followSymlinks,
		useAnsi: false,
		logLevel: options.logLevel ?? "silent",
		generatedDate: options.generatedDate,
		banner: options.banner,
		footer: options.footer
	};
	
	const config = resolveConfig(rootDirectory, fileConfig, userConfig);
	
	const outputRelativePath = relative(rootDirectory, config.outputFile);
	const outputRelativeNormalized = outputRelativePath.split(sep).join("/");
	
	if (outputRelativeNormalized !== "" && !outputRelativeNormalized.startsWith("../") && outputRelativeNormalized !== "..")
		config.excludedPaths = [ outputRelativeNormalized ];
	
	if (!config.includeContents) {
		config.maximumFileSizeBytes = Number.MAX_SAFE_INTEGER;
		config.maximumTotalSizeBytes = 0;
	}
	
	if (config.maximumFileSizeBytes <= 0)
		throw new Error("Max file size must be greater than 0.");
	
	if (config.maximumTotalSizeBytes < 0)
		throw new Error("Max total size must be 0 or greater.");
	
	const logger = createLogger({
		useAnsi: config.useAnsi,
		logLevel: config.logLevel
	});
	
	const result = await scanTree({
		projectName: projectMetadata.name,
		...config,
		onProgress: options.onProgress
	}, logger);
	
	await writeOutput(result, config);
	
	return {
		projectName: result.projectName,
		files: result.stats.files,
		directories: result.stats.directories,
		binary: result.stats.binary,
		skipped: result.stats.skipped,
		errors: result.stats.errors,
		totalSizeBytes: result.stats.totalSizeBytes,
		outputSizeBytes: result.stats.outputSizeBytes,
		outputTokenCount: result.stats.outputTokenCount,
		outputPath: config.outputFile,
		_root: result.root
	};
}
