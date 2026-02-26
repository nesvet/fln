import { resolve } from "node:path";
import { parseArgs } from "node:util";
import ignore from "ignore";
import { fln } from "../api/index.js";
import { runInit } from "../config/index.js";
import {
	collectExtensionStats,
	collectProcessedFiles,
	parseByteSize,
	type FileNode
} from "../core/index.js";
import {
	createProgressRenderer,
	filterPathsUnderBase,
	getChangedFilesSince,
	getTerminalInfo,
	incrementUsageCount,
	shouldShowSponsorMessage,
	shouldUseColors,
	warnDeprecated
} from "../infra/index.js";
import { getNullishOutput, resolveFromBase } from "../path/index.js";
import { normalizeIncludePattern } from "../pattern/index.js";
import { VERSION } from "../version.js";
import { formatHelpMessage } from "./help.js";
import { OutputRenderer } from "./output/index.js";


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
		process.env.FLN_NO_SPONSOR !== "1" &&
		shouldShowSponsorMessage(runCount)
	);
}

export async function runCommandLine(): Promise<void> {
	const { values, positionals } = parseArgs({
		options: {
			output: { type: "string", short: "o" },
			exclude: { type: "string", short: "e", multiple: true },
			include: { type: "string", short: "i", multiple: true },
			ext: { type: "string" },
			"include-hidden": { type: "boolean" },
			"no-gitignore": { type: "boolean" },
			"max-size": { type: "string" },
			"max-total-size": { type: "string" },
			"no-contents": { type: "boolean" },
			"no-tree": { type: "boolean" },
			format: { type: "string" },
			"dry-run": { type: "boolean" },
			stdout: { type: "boolean" },
			overwrite: { type: "boolean", short: "w" },
			quiet: { type: "boolean", short: "q" },
			verbose: { type: "boolean", short: "V" },
			debug: { type: "boolean" },
			"no-ansi": { type: "boolean" },
			"follow-symlinks": { type: "boolean" },
			"no-sponsor-message": { type: "boolean" },
			date: { type: "string" },
			"generated-date": { type: "string" },
			banner: { type: "string" },
			"banner-file": { type: "string" },
			footer: { type: "string" },
			"footer-file": { type: "string" },
			since: { type: "string" },
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
	
	if (positionals[0] === "init") {
		await runInit(values.overwrite ?? false);
		process.exit(0);
	}
	
	if (values.quiet && values.verbose)
		throw new Error("Cannot use --quiet and --verbose together.");
	
	if (values.quiet && values.debug)
		throw new Error("Cannot use --quiet and --debug together.");
	
	if (values.verbose && values.debug)
		throw new Error("Cannot use --verbose and --debug together.");
	
	const runCount = await incrementUsageCount();
	const input = resolve(process.cwd(), positionals[0] || ".");
	const isDryRun = values["dry-run"] ?? false;
	const isStdout = values.stdout ?? false;
	
	const logLevel = (values.quiet || isStdout) ? "silent" : values.debug ? "debug" : values.verbose ? "verbose" : "normal";
	const ansi = shouldUseColors() && !values["no-ansi"];
	
	if (values["generated-date"] !== undefined && values.date === undefined)
		warnDeprecated("--generated-date", "--date", "CLI");
	
	const date = values.date ?? values["generated-date"];
	
	const cwd = process.cwd();
	const sincePatterns = values.since ?
		filterPathsUnderBase(getChangedFilesSince(values.since, cwd), cwd, input) :
		[];
	const extPatterns = values.ext ?
		values.ext.split(",").map(ext => `**/*.${ext.trim().replace(/^\./, "")}`).filter(Boolean) :
		[];
	const sinceFiltered = values.since && values.ext ?
		(() => {
			const normalized = extPatterns
				.map(p => normalizeIncludePattern(p, input))
				.filter((p): p is string => p !== null);
			
			if (normalized.length === 0)
				return sincePatterns;
			const extMatcher = ignore().add(normalized);
			
			return sincePatterns.filter(path => extMatcher.ignores(path));
		})() :
		sincePatterns;
	if (values.since && sinceFiltered.length === 0 && !values.include?.length) {
		const extSuffix = values.ext ? ` matching --ext ${values.ext}` : "";
		console.info(`No changed files since ${values.since}${extSuffix}`);
		process.exit(0);
	}
	const includePatterns = values.since && values.ext ?
		[ ...sinceFiltered, ...(values.include ?? []) ] :
		[ ...sinceFiltered, ...extPatterns, ...(values.include ?? []) ];
	
	const renderer = new OutputRenderer({ logLevel, ansi });
	const progress = createProgressRenderer("🥞 Scanning...", ansi, (values.quiet ?? false) || isStdout);
	const startTime = Date.now();
	
	progress.start();
	const result = await fln({
		input,
		ansi,
		output: isDryRun ?
			getNullishOutput() :
			(isStdout ? "-" : (values.output ? resolveFromBase(values.output, cwd) : undefined)),
		overwrite: values.overwrite,
		excludePatterns: values.exclude,
		includePatterns:
			includePatterns.length > 0 || values.since ?
				includePatterns :
				undefined,
		includeHidden: values["include-hidden"],
		gitignore: values["no-gitignore"] ? false : undefined,
		maxFileSize: values["max-size"] ? parseByteSize(values["max-size"]) : undefined,
		maxTotalSize: values["max-total-size"] ? parseByteSize(values["max-total-size"]) : undefined,
		includeContents: values["no-contents"] ? false : undefined,
		includeTree: values["no-tree"] ? false : undefined,
		format: values.format as "json" | "md" | undefined,
		followSymlinks: values["follow-symlinks"],
		date,
		banner: values.banner,
		bannerFile: values["banner-file"],
		footer: values.footer,
		footerFile: values["footer-file"],
		onProgress: (current, total) => {
			progress.update(current, total, "files");
		},
		logLevel
	});
	
	const elapsedMs = Date.now() - startTime;
	
	progress.cleanup();
	
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
		console.info("💙 Support fln development: https://patreon.com/nesvet");
		console.info("");
	}
}
