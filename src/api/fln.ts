import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
	defaultConfigFileName,
	getProjectMetadata,
	loadConfigFile,
	normalizeConfigFile,
	resolveConfig,
	resolveOutputPath
} from "../config/index.js";
import { parseByteSize, scanTree, writeOutput } from "../core/index.js";
import { createLogger, resolveOption, symbols } from "../infra/index.js";
import { resolveFromBase, toCanonicalRelative } from "../path/index.js";
import type { FlnOptions, FlnResult } from "./types.js";

/**
 * Flatten your codebase into a single AI-ready file
 *
 * @example
 * ```typescript
 * import { fln } from "fln";
 *
 * const result = await fln({
 *   input: "./src",
 *   output: "output.md",
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
	// TODO(major): remove rootDirectory fallback
	const input = resolve(options.input ?? options.rootDirectory ?? process.cwd());
	const inputStats = await stat(input);
	if (!inputStats.isDirectory())
		throw new Error(`Input must be a directory, got file: ${input}`);
	
	const projectMetadata = await getProjectMetadata(input);
	
	const configFilePath = resolve(input, defaultConfigFileName);
	
	const { config: rawFileConfig, loaded: configLoaded, parseError } = await loadConfigFile(configFilePath);
	if (parseError)
		console.warn(parseError);
	
	const fileConfig = normalizeConfigFile(rawFileConfig);
	
	const format: "json" | "md" = options.format ?? (fileConfig.format as "json" | "md" | undefined) ?? "md";
	const overwrite = options.overwrite ?? fileConfig.overwrite ?? false;
	
	// TODO(major): remove outputFile fallback
	const outputValue = options.output ?? options.outputFile ?? fileConfig.output;
	const output = await resolveOutputPath(
		outputValue === "-" ? "-" : (outputValue ? resolveFromBase(outputValue, input) : undefined),
		input,
		projectMetadata,
		overwrite,
		format
	);
	
	const gitignore = resolveOption<boolean>(options, "gitignore", "useGitignore", "API");
	const maxFileSize = resolveOption<number | string>(options, "maxFileSize", "maximumFileSizeBytes", "API");
	const maxTotalSize = resolveOption<number | string>(options, "maxTotalSize", "maximumTotalSizeBytes", "API");
	const date = resolveOption<string>(options, "date", "generatedDate", "API");
	const ansi = resolveOption<boolean>(options, "ansi", "useAnsi", "API") ?? false;
	
	const userConfig = {
		output,
		overwrite: options.overwrite,
		excludePatterns: options.excludePatterns,
		includePatterns: options.includePatterns,
		includeHidden: options.includeHidden,
		gitignore,
		maxFileSize: maxFileSize === undefined ?
			undefined :
			(typeof maxFileSize === "string" ? parseByteSize(maxFileSize) : maxFileSize),
		maxTotalSize: maxTotalSize === undefined ?
			undefined :
			(typeof maxTotalSize === "string" ? parseByteSize(maxTotalSize) : maxTotalSize),
		includeContents: options.includeContents,
		includeTree: options.includeTree,
		format,
		followSymlinks: options.followSymlinks,
		ansi,
		logLevel: options.logLevel ?? "silent",
		date,
		banner: options.banner,
		bannerFile: options.bannerFile,
		footer: options.footer,
		footerFile: options.footerFile
	};
	
	const config = resolveConfig(input, fileConfig, userConfig);
	
	const outputCanonical = config.output === "-" ? null : toCanonicalRelative(config.output, input);
	if (outputCanonical && outputCanonical !== "")
		config.excludedPaths = [ outputCanonical ];
	
	async function resolveBannerFooterFile(
		filePath: string | undefined
	): Promise<{ content: string; excludedPath?: string }> {
		if (filePath) {
			const absolutePath = resolveFromBase(filePath, input);
			const content = await readFile(absolutePath, "utf8");
			const excludedPath = toCanonicalRelative(absolutePath, input) ?? undefined;
			
			return { content, excludedPath };
		}
		
		return { content: "" };
	}
	
	const [ bannerFileResult, footerFileResult ] = await Promise.all([
		resolveBannerFooterFile(config.bannerFile),
		resolveBannerFooterFile(config.footerFile)
	]);
	
	const bannerParts = [ config.banner, bannerFileResult.content ].filter(Boolean) as string[];
	const footerParts = [ config.footer, footerFileResult.content ].filter(Boolean) as string[];
	config.banner = bannerParts.length > 0 ? bannerParts.join("\n\n") : undefined;
	config.footer = footerParts.length > 0 ? footerParts.join("\n\n") : undefined;
	
	if (bannerFileResult.excludedPath)
		config.excludedPaths.push(bannerFileResult.excludedPath);
	if (footerFileResult.excludedPath)
		config.excludedPaths.push(footerFileResult.excludedPath);
	
	if (!config.includeContents) {
		config.maxFileSize = Number.MAX_SAFE_INTEGER;
		config.maxTotalSize = 0;
	}
	
	if (config.maxFileSize <= 0)
		throw new Error("Max file size must be greater than 0.");
	
	if (config.maxTotalSize < 0)
		throw new Error("Max total size must be 0 or greater.");
	
	const logger = createLogger({
		ansi: config.ansi,
		logLevel: config.logLevel
	});
	
	if (configLoaded)
		logger.info(`${symbols.info} Using config: ${defaultConfigFileName}`);
	
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
		outputPath: config.output,
		_root: result.root
	};
}
