import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { flatr } from "$api";
import {
	collectExtensionStats,
	collectProcessedFiles,
	parseByteSize,
	type FileNode
} from "$core";
import {
	getTerminalInfo,
	incrementUsageCount,
	shouldShowSponsorMessage,
	shouldUseColors
} from "$infra";
import { VERSION } from "$version";
import { formatHelpMessage } from "./help";
import { OutputRenderer } from "./output";


function isCI(): boolean {
	return Boolean(
		process.env.CI ||
		process.env.CONTINUOUS_INTEGRATION ||
		process.env.BUILD_NUMBER ||
		process.env.GITHUB_ACTIONS ||
		process.env.GITLAB_CI ||
		process.env.CIRCLECI
	);
}

function shouldShowSponsor(runCount: number, noSponsorFlag: boolean): boolean {
	return (
		!noSponsorFlag &&
		!isCI() &&
		process.env.FLATR_NO_SPONSOR !== "1" &&
		shouldShowSponsorMessage(runCount)
	);
}

export async function runCommandLine(): Promise<void> {
	const { values, positionals } = parseArgs({
		options: {
			output: { type: "string", short: "o" },
			exclude: { type: "string", short: "e", multiple: true },
			include: { type: "string", short: "i", multiple: true },
			"include-hidden": { type: "boolean" },
			"no-gitignore": { type: "boolean" },
			"max-size": { type: "string" },
			"max-total-size": { type: "string" },
			"no-contents": { type: "boolean" },
			"no-tree": { type: "boolean" },
			format: { type: "string" },
			"dry-run": { type: "boolean" },
			quiet: { type: "boolean", short: "q" },
			verbose: { type: "boolean", short: "V" },
			debug: { type: "boolean" },
			"no-ansi": { type: "boolean" },
			"follow-symlinks": { type: "boolean" },
			"no-sponsor-message": { type: "boolean" },
			banner: { type: "string" },
			footer: { type: "string" },
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" }
		},
		strict: true,
		allowPositionals: true
	});
	
	if (values.version) {
		console.info(VERSION);
		process.exit(0);
	}
	
	if (values.help) {
		const { supportsAnsi } = getTerminalInfo();
		console.info(formatHelpMessage(supportsAnsi));
		process.exit(0);
	}
	
	if (values.quiet && values.verbose)
		throw new Error("Cannot use --quiet and --verbose together.");
	
	if (values.quiet && values.debug)
		throw new Error("Cannot use --quiet and --debug together.");
	
	if (values.verbose && values.debug)
		throw new Error("Cannot use --verbose and --debug together.");
	
	const runCount = await incrementUsageCount();
	const rootDirectory = resolve(process.cwd(), positionals[0] || ".");
	const isDryRun = values["dry-run"] ?? false;
	
	const logLevel = values.quiet ? "silent" : values.debug ? "debug" : values.verbose ? "verbose" : "normal";
	const useAnsi = shouldUseColors() && !values["no-ansi"];
	
	const renderer = new OutputRenderer({ logLevel, useAnsi });
	
	const progress = renderer.createProgressBar(100);
	const startTime = Date.now();
	
	const result = await flatr({
		rootDirectory,
		outputFile: isDryRun ?
			(process.platform === "win32" ? "nul" : "/dev/null") :
			(values.output ? resolve(values.output) : undefined),
		excludePatterns: values.exclude,
		includePatterns: values.include,
		includeHidden: values["include-hidden"],
		useGitignore: values["no-gitignore"] ? false : undefined,
		maximumFileSizeBytes: values["max-size"] ? parseByteSize(values["max-size"]) : undefined,
		maximumTotalSizeBytes: values["max-total-size"] ? parseByteSize(values["max-total-size"]) : undefined,
		includeContents: values["no-contents"] ? false : undefined,
		includeTree: values["no-tree"] ? false : undefined,
		format: values.format as "json" | "md" | undefined,
		followSymlinks: values["follow-symlinks"],
		banner: values.banner,
		footer: values.footer,
		onProgress: () => {
			progress.increment();
		},
		logLevel
	});
	
	const elapsedMs = Date.now() - startTime;
	
	progress.clear();
	
	if (isDryRun && logLevel !== "silent")
		console.info("Dry run mode — output was not written");
	
	const breakdown = (logLevel === "verbose" || logLevel === "debug") && result._root ?
		collectExtensionStats(result._root as FileNode) :
		undefined;
	
	const processedFiles = logLevel === "debug" && result._root ?
		collectProcessedFiles(result._root as FileNode) :
		undefined;
	
	renderer.renderSuccess({
		outputPath: result.outputPath,
		result,
		elapsedMs,
		breakdown,
		processedFiles
	});
	
	if (!isDryRun && logLevel !== "silent" && shouldShowSponsor(runCount, Boolean(values["no-sponsor-message"]))) {
		console.info("");
		console.info("💙 Support flatr development: https://patreon.com/nesvet");
		console.info("");
	}
}
