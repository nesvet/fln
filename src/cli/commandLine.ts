import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { diff, type FlnDiff, formatDiffText } from "../api/diff.js";
import { mcp } from "../api/mcp.js";
import {
	finalizeClipboardOutput,
	runFlnPipeline,
	toFlnResult,
	validateCopyOptions,
} from "../api/pipeline.js";
import { formatPlanText, plan } from "../api/plan.js";
import type { FlnResult } from "../api/types.js";
import { runInit } from "../config/index.js";
import {
	collectExtensionStats,
	collectProcessedFiles,
	collectSkipReasonCounts,
	parseByteSize,
	writeOutput,
} from "../core/index.js";
import type { FileNode } from "../core/types.js";
import {
	createProgressRenderer,
	FlnError,
	flnError,
	getTerminalInfo,
	incrementUsageCount,
	shouldShowSponsorMessage,
} from "../infra/index.js";
import { resolveFromBase } from "../path/index.js";
import {
	buildSinceOnlyPatterns,
	formatNoChangesSinceMessage,
	shouldExitForEmptySince,
} from "../pattern/index.js";
import { VERSION } from "../version.js";
import { runDoctorCommand } from "./doctorCommand.js";
import {
	type FlattenFormat,
	parseCliArgv,
	type TextJsonFormat,
} from "./flagsManifest.js";
import { formatFlnCliError, resolveExitCode } from "./flnErrorOutput.js";
import { formatHelpMessage } from "./help.js";
import { mapCliFlagsToFlnOptions, resolveCliAnsi } from "./mapCliFlags.js";
import { OutputRenderer } from "./output/index.js";
import { runWhyCommand } from "./whyCommand.js";

function isCI(): boolean {
	return Boolean(
		process.env.CI ||
			process.env.CONTINUOUS_INTEGRATION ||
			process.env.BUILD_NUMBER ||
			process.env.GITHUB_ACTIONS ||
			process.env.GITLAB_CI ||
			process.env.CIRCLECI,
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

async function writeDiffOutput(
	diffResult: FlnDiff,
	format: TextJsonFormat,
	output: string | undefined,
	isStdout: boolean,
): Promise<void> {
	if (format === "json") {
		const json = JSON.stringify(diffResult, null, "\t");
		if (isStdout || !output) console.info(json);
		else {
			const { writeFile: writeDiffFile } = await import("node:fs/promises");
			await writeDiffFile(resolveFromBase(output, process.cwd()), json, "utf8");
		}
	} else {
		const text = formatDiffText(diffResult);
		if (isStdout || !output) console.info(text);
		else {
			const { writeFile: writeDiffFile } = await import("node:fs/promises");
			await writeDiffFile(resolveFromBase(output, process.cwd()), text, "utf8");
		}
	}
}

function parseFlattenFormat(format: string | undefined): FlattenFormat {
	if (format === undefined || format === "md") return "md";
	if (format === "json") return "json";
	throw flnError(
		"INVALID_CONFIG",
		`Invalid --format: ${format}. Use md or json.`,
	);
}

function parseDiffFormat(format: string | undefined): TextJsonFormat {
	if (format === undefined || format === "text") return "text";
	if (format === "json") return "json";
	throw flnError(
		"INVALID_CONFIG",
		`Invalid --format for fln diff: ${format}. Use text or json.`,
	);
}

async function readStdinPaths(): Promise<string[]> {
	if (process.stdin.isTTY)
		throw flnError(
			"INVALID_CONFIG",
			"--stdin requires piped input (e.g. git ls-files | fln --stdin).",
			{ hint: "Pipe a newline-separated file list to stdin." },
		);
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin)
		chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
	const content = Buffer.concat(chunks).toString("utf8");

	return content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export async function runCommandLine(): Promise<void> {
	const { flags, positionals } = parseCliArgv(process.argv.slice(2));
	const values = flags;

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

	if (positionals[0] === "why") {
		await runWhyCommand(positionals, values);

		return;
	}

	if (positionals[0] === "doctor") {
		await runDoctorCommand(positionals, values);

		return;
	}

	if (positionals[0] === "mcp") {
		const mcpInput = positionals.find(
			(candidate) =>
				candidate !== "mcp" &&
				!candidate.endsWith(".ts") &&
				!candidate.endsWith(".js") &&
				!candidate.endsWith(".mjs") &&
				!candidate.endsWith(".cjs"),
		);

		await mcp({
			defaultInput: mcpInput ? resolve(process.cwd(), mcpInput) : undefined,
			http: values.http,
			port: values.port ? Number.parseInt(values.port, 10) : undefined,
		});

		return;
	}

	if (positionals[0] === "upgrade") {
		const { runUpgradeCommand } = await import("./upgradeCommand.js");
		try {
			await runUpgradeCommand();
		} catch (error) {
			if (error instanceof FlnError) {
				console.error(formatFlnCliError(error));
				process.exit(1);
			}

			throw error;
		}

		return;
	}

	if (positionals[0] === "plan") {
		const planInput = positionals.find(
			(candidate) =>
				candidate !== "plan" &&
				!candidate.endsWith(".ts") &&
				!candidate.endsWith(".js") &&
				!candidate.endsWith(".mjs") &&
				!candidate.endsWith(".cjs"),
		);
		const planDir = planInput
			? resolve(process.cwd(), planInput)
			: process.cwd();
		const planBudgetRaw = values.budget ?? values.maxTokens;
		const planBudget = planBudgetRaw ? Number.parseInt(planBudgetRaw, 10) : 0;
		if (planBudgetRaw && (Number.isNaN(planBudget) || planBudget < 0))
			throw flnError("INVALID_CONFIG", `Invalid --budget: "${planBudgetRaw}"`);
		const planFormat = parseFlattenFormat(values.format);
		const isStdout = values.stdout ?? false;
		const relevantSeeds = values.relevant ?? [];
		const stdinPaths = values.stdin ? await readStdinPaths() : undefined;

		const planResult = await plan({
			input: planDir,
			budget: planBudget,
			relevant: relevantSeeds.length > 0 ? relevantSeeds : undefined,
			stdinPaths,
			exclude: values.exclude,
			include: values.include,
			only: values.only,
			since: values.since,
			logLevel: "silent",
		});

		if (planFormat === "json") {
			const json = JSON.stringify(planResult, null, "\t");
			if (isStdout || !values.output) console.info(json);
			else {
				const { writeFile: writePlanFile } = await import("node:fs/promises");
				await writePlanFile(
					resolveFromBase(values.output, process.cwd()),
					json,
					"utf8",
				);
			}
		} else {
			const text = formatPlanText(planResult);
			if (isStdout || !values.output) console.info(text);
			else {
				const { writeFile: writePlanFile } = await import("node:fs/promises");
				await writePlanFile(
					resolveFromBase(values.output, process.cwd()),
					text,
					"utf8",
				);
			}
		}

		return;
	}

	if (positionals[0] === "diff") {
		const diffArgs = positionals.filter(
			(candidate) =>
				candidate !== "diff" &&
				candidate !== "upgrade" &&
				!candidate.endsWith(".ts") &&
				!candidate.endsWith(".js") &&
				!candidate.endsWith(".mjs") &&
				!candidate.endsWith(".cjs"),
		);
		const [beforePath, afterPath] = diffArgs;

		if (values.since) {
			const diffResult = await diff({
				since: values.since,
				input: process.cwd(),
				includeHunks: values.diffHunks,
			});
			await writeDiffOutput(
				diffResult,
				parseDiffFormat(values.format),
				values.output,
				values.stdout ?? false,
			);

			return;
		}

		if (!beforePath || !afterPath)
			throw flnError(
				"INVALID_CONFIG",
				"fln diff requires two snapshot file paths (or --since <ref>): fln diff <before> <after> | fln diff --since <ref>",
				{
					hint: "Examples: fln diff snapshot-v1.md snapshot-v2.md  |  fln diff --since HEAD~1  |  fln diff HEAD~1 HEAD",
				},
			);

		const resolvedBefore = resolve(process.cwd(), beforePath);
		const resolvedAfter = resolve(process.cwd(), afterPath);
		const beforeExists = existsSync(resolvedBefore);
		const afterExists = existsSync(resolvedAfter);

		let diffResult: FlnDiff;
		if (beforeExists && afterExists)
			diffResult = await diff({
				before: resolvedBefore,
				after: resolvedAfter,
				includeHunks: values.diffHunks,
			});
		else if (!beforeExists && !afterExists)
			diffResult = await diff({
				refs: [beforePath, afterPath],
				input: process.cwd(),
				includeHunks: values.diffHunks,
			});
		else
			throw flnError(
				"INVALID_CONFIG",
				`Cannot diff: "${beforeExists ? afterPath : beforePath}" does not exist as a file. Use two file paths or two git refs.`,
				{
					hint: "Examples: fln diff snapshot-v1.md snapshot-v2.md  |  fln diff HEAD~1 HEAD",
				},
			);

		await writeDiffOutput(
			diffResult,
			parseDiffFormat(values.format),
			values.output,
			values.stdout ?? false,
		);

		return;
	}

	if (values.quiet && values.verbose)
		throw flnError(
			"INVALID_CONFIG",
			"Cannot use --quiet and --verbose together.",
		);

	if (values.quiet && values.debug)
		throw flnError(
			"INVALID_CONFIG",
			"Cannot use --quiet and --debug together.",
		);

	if (values.verbose && values.debug)
		throw flnError(
			"INVALID_CONFIG",
			"Cannot use --verbose and --debug together.",
		);

	const runCount = await incrementUsageCount({
		skipWrite: Boolean(values.noLocalState),
	});
	const inputDirectoryArg = positionals.find(
		(candidate) =>
			candidate !== "init" &&
			candidate !== "doctor" &&
			candidate !== "why" &&
			candidate !== "mcp" &&
			candidate !== "plan" &&
			candidate !== "diff" &&
			candidate !== "upgrade" &&
			!candidate.endsWith(".ts") &&
			!candidate.endsWith(".js") &&
			!candidate.endsWith(".mjs") &&
			!candidate.endsWith(".cjs"),
	);
	const input = resolve(process.cwd(), inputDirectoryArg ?? ".");
	const isDryRun = values.dryRun ?? false;
	const isStdout = values.stdout ?? false;
	const isCopy = values.copy ?? false;

	const logLevel =
		values.quiet || isStdout || isCopy
			? "silent"
			: values.debug
				? "debug"
				: values.verbose
					? "verbose"
					: "normal";
	const ansi = resolveCliAnsi(values, !isStdout && !isCopy);

	const cwd = process.cwd();
	const { only, onlyMode, sinceFiltered } = buildSinceOnlyPatterns(
		values,
		input,
		cwd,
	);
	if (shouldExitForEmptySince(values, sinceFiltered) && values.since) {
		console.info(formatNoChangesSinceMessage(values.since, values.ext));
		process.exit(0);
	}
	const forceInclude = values.include ?? [];
	const maxTokens = values.maxTokens
		? Number.parseInt(values.maxTokens, 10)
		: undefined;
	if (maxTokens !== undefined && (Number.isNaN(maxTokens) || maxTokens < 0))
		throw flnError(
			"INVALID_CONFIG",
			`Invalid --max-tokens: "${values.maxTokens}"`,
		);
	const maxContentTokens = values.maxContentTokens
		? Number.parseInt(values.maxContentTokens, 10)
		: undefined;
	if (
		maxContentTokens !== undefined &&
		(Number.isNaN(maxContentTokens) || maxContentTokens < 0)
	)
		throw flnError(
			"INVALID_CONFIG",
			`Invalid --max-content-tokens: "${values.maxContentTokens}"`,
		);
	const outputSplit = values.outputSplit
		? Number.parseInt(values.outputSplit, 10)
		: undefined;
	if (
		outputSplit !== undefined &&
		(Number.isNaN(outputSplit) || outputSplit < 1)
	)
		throw flnError(
			"INVALID_CONFIG",
			`Invalid --output-split: "${values.outputSplit}"`,
		);
	if (isCopy)
		validateCopyOptions({
			copy: true,
			dryRun: isDryRun,
			output: isStdout
				? "-"
				: values.output
					? resolveFromBase(values.output, cwd)
					: undefined,
			outputSplit,
		});

	const encoding =
		values.encoding === "utf8" ||
		values.encoding === "latin1" ||
		values.encoding === "auto"
			? values.encoding
			: values.encoding === undefined
				? undefined
				: (() => {
						throw flnError(
							"INVALID_CONFIG",
							`Invalid --encoding: "${values.encoding}"`,
						);
					})();

	const renderer = new OutputRenderer({ logLevel, ansi });
	const progress = createProgressRenderer(
		"🥞 Scanning...",
		ansi,
		(values.quiet ?? false) || isStdout || isCopy,
	);
	const startTime = Date.now();

	const stdinPaths = values.stdin ? await readStdinPaths() : undefined;

	progress.start();
	let result: FlnResult;
	let scanRoot: FileNode;
	try {
		const pipeline = await runFlnPipeline({
			input,
			ansi,
			...mapCliFlagsToFlnOptions(values),
			copy: isCopy,
			output: isStdout
				? "-"
				: values.output
					? resolveFromBase(values.output, cwd)
					: undefined,
			include: forceInclude.length > 0 ? forceInclude : undefined,
			only: only.length > 0 ? only : undefined,
			relevant: values.relevant?.length ? values.relevant : undefined,
			stdinPaths,
			onlyMode,
			maxFileSize: values.maxFileSize
				? parseByteSize(values.maxFileSize)
				: undefined,
			maxTotalSize: values.maxTotalSize
				? parseByteSize(values.maxTotalSize)
				: undefined,
			maxTokens,
			maxContentTokens,
			tokenModel: values.tokenModel as
				| import("../infra/tokenBudget.js").TokenModel
				| undefined,
			encoding,
			outputSplit,
			onProgress: (current, total) => {
				progress.update(current, total, "files");
			},
			logLevel,
			dryRun: isDryRun,
		});
		scanRoot = pipeline.scan.root;
		if (!isDryRun) {
			await writeOutput(pipeline.scan, pipeline.config, pipeline.logger);
			await finalizeClipboardOutput(pipeline);
		}
		result = toFlnResult(pipeline.scan, pipeline.outputPath);
	} catch (error) {
		progress.cleanup();
		console.error(formatFlnCliError(error));
		process.exit(resolveExitCode(error));
	}

	const elapsedMs = Date.now() - startTime;

	progress.cleanup();

	if (isDryRun && logLevel !== "silent")
		console.info("Dry run mode — output was not written");

	if (
		isDryRun &&
		(logLevel === "verbose" || logLevel === "debug") &&
		scanRoot
	) {
		const skipCounts = collectSkipReasonCounts(scanRoot);
		if (skipCounts.size > 0) {
			const parts = [...skipCounts.entries()]
				.map(([reason, count]) => `${count} ${reason}`)
				.join(", ");
			console.info(`Skipped in tree: ${parts}`);
		}
	}

	const breakdown =
		(logLevel === "verbose" || logLevel === "debug") && scanRoot
			? collectExtensionStats(scanRoot)
			: undefined;

	const processedFiles =
		logLevel === "debug" && scanRoot
			? collectProcessedFiles(scanRoot)
			: undefined;

	renderer.renderSuccess({
		outputPath: isCopy ? "clipboard" : result.outputPath,
		result,
		elapsedMs,
		breakdown,
		processedFiles,
	});

	if (
		!isDryRun &&
		logLevel !== "silent" &&
		shouldShowSponsor(runCount, Boolean(values.noSponsorMessage))
	) {
		console.info("");
		console.info("💙 Support fln development: https://patreon.com/nesvet");
		console.info("");
	}
}
