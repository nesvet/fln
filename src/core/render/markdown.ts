import { extname, join } from "node:path";
import type { FlnConfig } from "../../config/index.js";
import { formatDateTime, getBatchedUnifiedDiffs } from "../../infra/index.js";
import { VERSION } from "../../version.js";
import {
	maxBacktickSampleBytes,
	readMaxBacktickSample,
} from "../fileContent.js";
import { sortFileNodesByPriority } from "../filePriority.js";
import { renderTree } from "../renderTree.js";
import { formatByteSize } from "../size.js";
import type { FileNode, ScanResult, SkipReason } from "../types.js";
import { applyOmittedStats, logOmittedSummary } from "./collectStats.js";
import { writeMarkdownFileBody } from "./fileBody.js";
import { isTokenBudgetExceeded, markLimitSkip } from "./limits.js";
import { filterAndCollectFileNodes } from "./nodes.js";
import { TodoCollector } from "./todoCollector.js";
import { writeTodoSection } from "./todoMarkdown.js";
import type { RenderLogger } from "./types.js";
import { createWriterForConfig, finalizeWriter } from "./writer.js";

async function writeDirectoryTreeSection(
	writer: Awaited<ReturnType<typeof createWriterForConfig>>,
	effectiveRoot: FileNode,
	config: FlnConfig,
): Promise<void> {
	await writer.writeLine("## Directory Tree");
	await writer.writeLine("```text");
	await writer.write(
		renderTree(effectiveRoot, {
			compress: config.compress,
			annotate: config.annotateTree,
		}),
	);
	await writer.writeLine("```");
	await writer.writeLine("");
	await writer.writeLine("---");
	await writer.writeLine("");
}

function getLanguageFromFilename(fileName: string): string {
	const extension = extname(fileName).replace(".", "");

	return extension === "" ? "txt" : extension;
}

export function getFenceLength(node: FileNode): number {
	const maxBackticks = node.maxBacktickRun ?? 0;
	const fence = maxBackticks >= 3 ? maxBackticks + 1 : 3;

	if (node.size > maxBacktickSampleBytes) return fence + 1;

	return fence;
}

function formatFilesHeaderLine(stats: ScanResult["stats"]): string {
	const included = stats.filesIncluded;
	const scanned = stats.filesScanned;

	if (scanned === included)
		return `Files: ${included} | Directories: ${stats.directories}`;

	return `Files: ${included} (${scanned} scanned) | Directories: ${stats.directories}`;
}

function getSplitOutputPath(outputPath: string, partNumber: number): string {
	if (partNumber <= 1) return outputPath;

	const extension = extname(outputPath);
	const base = extension ? outputPath.slice(0, -extension.length) : outputPath;

	return `${base}.part${partNumber}${extension}`;
}

async function ensureMaxBacktickRun(
	node: FileNode,
	absolutePath: string,
	encoding: FlnConfig["encoding"],
): Promise<void> {
	if (node.maxBacktickRun !== undefined) return;

	let run: number;
	try {
		run = await readMaxBacktickSample(absolutePath, node.size, encoding);
	} catch {
		run = 0;
	}

	node.maxBacktickRun = run;
}

export async function writeMarkdown(
	result: ScanResult,
	config: FlnConfig,
	logger: RenderLogger,
): Promise<void> {
	const { filtered: outputRoot, fileNodes } = filterAndCollectFileNodes(
		result.root,
	);
	const effectiveRoot = outputRoot ?? { ...result.root, children: [] };
	sortFileNodesByPriority(fileNodes);
	const renderOmitted = new Map<SkipReason, number>();

	const diffCache =
		config.diffHunks && config.since
			? getBatchedUnifiedDiffs(
					config.since,
					fileNodes.map((node) => node.path),
					config.input,
				)
			: undefined;

	const maxParts = Math.max(1, config.outputSplit);
	let partNumber = 1;
	let fileIndex = 0;
	const todoCollector = config.collectTodo ? new TodoCollector() : undefined;
	const treeAtTop =
		config.annotateTree === undefined || config.annotateTree === "size";
	const treeAtEnd =
		config.annotateTree === "tokens" || config.annotateTree === "lines";
	const fileBodyHooks = {
		todoCollector,
		annotateTree: config.annotateTree,
	};

	while (fileIndex < fileNodes.length || partNumber === 1) {
		const outputPath = getSplitOutputPath(config.output, partNumber);
		const writer = await createWriterForConfig(config, outputPath);
		let contentTokensUsed = 0;
		let omittedToken = 0;
		let omittedSize = 0;
		let limitReason: SkipReason | undefined;

		try {
			if (config.output !== "-") {
				await writer.writeLine(
					`<!-- 🥞 fln ${VERSION} · model: ${config.tokenModel} -->`,
				);
				await writer.writeLine("");
			}
			await writer.writeLine(`# Codebase Snapshot: ${result.projectName}`);
			await writer.writeLine("");
			if (partNumber > 1) {
				await writer.writeLine(
					`> Part ${partNumber} of ${maxParts} (continued)`,
				);
				await writer.writeLine("");
			}
			await writer.writeLine(`Generated: ${config.date ?? formatDateTime()}  `);
			await writer.writeLine(formatFilesHeaderLine(result.stats));
			await writer.writeLine("");
			await writer.writeLine("---");
			await writer.writeLine("");

			if (config.banner) {
				await writer.writeLine(config.banner);
				await writer.writeLine("");
			}

			if (config.tree && partNumber === 1 && treeAtTop)
				await writeDirectoryTreeSection(writer, effectiveRoot, config);

			if (config.contents && fileNodes.length > 0) {
				await writer.writeLine("## Source Files");
				await writer.writeLine("");

				for (; fileIndex < fileNodes.length; fileIndex++) {
					if (
						isTokenBudgetExceeded(
							writer,
							config.maxTokens,
							contentTokensUsed,
							config.maxContentTokens,
						)
					) {
						limitReason = "tokenLimit";
						break;
					}

					const node = fileNodes[fileIndex];
					const language = getLanguageFromFilename(node.name);
					const modeLabel = config.outline ? " (outline)" : "";

					if (!node.isBinary)
						await ensureMaxBacktickRun(
							node,
							join(config.input, node.path),
							config.encoding,
						);

					const fence = "`".repeat(getFenceLength(node));
					const sectionHeader = `### ${node.path}${modeLabel}\n${fence}${language}\n`;
					const tokensBeforeSection = writer.getStats().tokenCount;

					if (config.maxTotalSize > 0 && writer.wouldExceed(sectionHeader)) {
						limitReason = "totalSizeLimit";
						markLimitSkip(node, "totalSizeLimit", config);
						renderOmitted.set(
							"totalSizeLimit",
							(renderOmitted.get("totalSizeLimit") ?? 0) + 1,
						);
						omittedSize++;
						break;
					}

					if (config.maxTokens > 0 && writer.wouldExceed(sectionHeader)) {
						limitReason = "tokenLimit";
						break;
					}

					await writer.writeLine(`### ${node.path}${modeLabel}`);
					await writer.writeLine(`${fence}${language}`);

					const tokensBeforeBody = writer.getStats().tokenCount;

					if (node.isBinary)
						await writer.writeLine(
							`[BINARY FILE: ${formatByteSize(node.size)}]`,
						);
					else
						try {
							await writeMarkdownFileBody(
								writer,
								node,
								config,
								logger,
								diffCache,
								fileBodyHooks,
							);
						} catch {
							await writer.writeLine("[READ ERROR]");
						}

					if (config.annotateTree === "tokens" && !node.isBinary) {
						const tokens = writer.getStats().tokenCount - tokensBeforeBody;
						node.treeAnnotation = { ...node.treeAnnotation, tokens };
					}

					await writer.writeLine(fence);
					if (config.maxContentTokens > 0)
						contentTokensUsed +=
							writer.getStats().tokenCount - tokensBeforeSection;

					if (
						fileIndex < fileNodes.length - 1 &&
						!isTokenBudgetExceeded(
							writer,
							config.maxTokens,
							contentTokensUsed,
							config.maxContentTokens,
						)
					)
						await writer.writeLine("");
				}

				const canContinueOnNextPart =
					limitReason !== undefined &&
					fileIndex < fileNodes.length &&
					partNumber < maxParts;

				if (!canContinueOnNextPart && fileIndex < fileNodes.length) {
					while (fileIndex < fileNodes.length) {
						const remaining = fileNodes[fileIndex];
						const reason = limitReason ?? "tokenLimit";
						markLimitSkip(remaining, reason, config);
						renderOmitted.set(reason, (renderOmitted.get(reason) ?? 0) + 1);
						if (reason === "tokenLimit") omittedToken++;
						else omittedSize++;
						fileIndex++;
					}

					result.stats.skipped += omittedToken + omittedSize;
				}
			}

			const allFilesRendered = fileIndex >= fileNodes.length;
			if (
				config.tree &&
				treeAtEnd &&
				allFilesRendered &&
				partNumber === maxParts
			)
				await writeDirectoryTreeSection(writer, effectiveRoot, config);

			if (todoCollector && allFilesRendered && partNumber === maxParts)
				await writeTodoSection((line) => writer.writeLine(line), todoCollector);

			if (config.footer && partNumber === maxParts) {
				await writer.writeLine("");
				await writer.writeLine(config.footer);
			}

			const showOmittedComment =
				(omittedToken > 0 || omittedSize > 0) &&
				!(
					limitReason !== undefined &&
					fileIndex < fileNodes.length &&
					partNumber < maxParts
				);
			if (showOmittedComment) {
				await writer.writeLine("");
				const parts: string[] = [];
				if (omittedToken > 0) parts.push(`${omittedToken} token limit`);
				if (omittedSize > 0) parts.push(`${omittedSize} output size`);
				await writer.writeLine(`<!-- Omitted: ${parts.join(", ")} -->`);
			}

			await finalizeWriter(writer, result);
		} catch (error) {
			await finalizeWriter(writer, result, error);
		}

		if (fileIndex >= fileNodes.length) break;

		if (limitReason !== undefined && partNumber < maxParts) {
			partNumber++;
			limitReason = undefined;
			continue;
		}

		break;
	}

	applyOmittedStats(result, renderOmitted);
	logOmittedSummary(result, logger);
}
