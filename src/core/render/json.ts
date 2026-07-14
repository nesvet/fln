import { extname } from "node:path";
import type { FlnConfig } from "../../config/index.js";
import { formatDateTime, getBatchedUnifiedDiffs } from "../../infra/index.js";
import { VERSION } from "../../version.js";
import { sortFileNodesByPriority } from "../filePriority.js";
import type { ScanResult, SkipReason } from "../types.js";
import {
	applyOmittedStats,
	collectOmittedFiles,
	logOmittedSummary,
} from "./collectStats.js";
import { writeJsonFileBody } from "./fileBody.js";
import { isTokenBudgetExceeded, markLimitSkip } from "./limits.js";
import { filterAndCollectFileNodes } from "./nodes.js";
import { TodoCollector } from "./todoCollector.js";
import type { RenderLogger } from "./types.js";
import { createWriterForConfig, finalizeWriter } from "./writer.js";

function getLanguageFromFilename(fileName: string): string {
	const extension = extname(fileName).replace(".", "");

	return extension === "" ? "txt" : extension;
}

export async function writeJson(
	result: ScanResult,
	config: FlnConfig,
	logger: RenderLogger,
): Promise<void> {
	const writer = await createWriterForConfig(config);
	const { filtered: outputRoot, fileNodes } = filterAndCollectFileNodes(
		result.root,
	);
	const effectiveRoot = outputRoot ?? { ...result.root, children: [] };
	sortFileNodesByPriority(fileNodes);
	const renderOmitted = new Map<SkipReason, number>();
	let contentTokensUsed = 0;
	const todoCollector = config.collectTodo ? new TodoCollector() : undefined;
	const fileBodyHooks = {
		todoCollector,
		annotateTree: config.annotateTree,
	};
	const writeRootBeforeFiles = !config.annotateTree;

	const diffCache =
		config.diffHunks && config.since
			? getBatchedUnifiedDiffs(
					config.since,
					fileNodes.map((node) => node.path),
					config.input,
				)
			: undefined;

	try {
		await writer.write("{");
		await writer.write('"schemaVersion":2');
		await writer.write(`,"version":${JSON.stringify(VERSION)}`);
		await writer.write(
			`,"generated":${JSON.stringify(config.date ?? formatDateTime())}`,
		);
		await writer.write(`,"projectName":${JSON.stringify(result.projectName)}`);
		await writer.write(`,"input":${JSON.stringify(config.input)}`);
		await writer.write(
			`,"options":${JSON.stringify({
				tree: config.tree,
				contents: config.contents,
				format: config.format,
				maxFileSize: config.maxFileSize,
				maxTotalSize: config.maxTotalSize,
				maxTokens: config.maxTokens,
				maxContentTokens: config.maxContentTokens,
				tokenModel: config.tokenModel,
				strictLimits: config.strictLimits,
				compress: config.compress,
				outline: config.outline,
				includeHidden: config.includeHidden,
				gitignore: config.gitignore,
				exclude: config.exclude,
				include: config.include,
				followSymlinks: config.followSymlinks,
				banner: config.banner,
				footer: config.footer,
				annotateTree: config.annotateTree,
				collectTodo: config.collectTodo,
			})}`,
		);
		if (writeRootBeforeFiles)
			await writer.write(`,"root":${JSON.stringify(effectiveRoot)}`);

		if (config.contents) {
			await writer.write(',"files":[');

			let isFirst = true;
			for (const node of fileNodes) {
				if (
					isTokenBudgetExceeded(
						writer,
						config.maxTokens,
						contentTokensUsed,
						config.maxContentTokens,
					)
				) {
					markLimitSkip(node, "tokenLimit", config);
					renderOmitted.set(
						"tokenLimit",
						(renderOmitted.get("tokenLimit") ?? 0) + 1,
					);
					break;
				}

				const fileHeader = `{"path":${JSON.stringify(node.path)}`;
				if (config.maxTotalSize > 0 && writer.wouldExceed(fileHeader)) {
					markLimitSkip(node, "totalSizeLimit", config);
					renderOmitted.set(
						"totalSizeLimit",
						(renderOmitted.get("totalSizeLimit") ?? 0) + 1,
					);
					break;
				}

				if (!isFirst) await writer.write(",");

				isFirst = false;

				await writer.write("{");
				await writer.write(`"path":${JSON.stringify(node.path)}`);
				await writer.write(
					`,"language":${JSON.stringify(getLanguageFromFilename(node.name))}`,
				);
				await writer.write(
					`,"isBinary":${JSON.stringify(Boolean(node.isBinary))}`,
				);

				const tokensBeforeBody = writer.getStats().tokenCount;

				if (node.isBinary) await writer.write(',"content":null');
				else
					try {
						await writeJsonFileBody(
							writer,
							node,
							config,
							logger,
							diffCache,
							fileBodyHooks,
						);
					} catch {
						await writer.write(',"skipReason":"readError","content":null');
					}

				if (config.annotateTree === "tokens" && !node.isBinary) {
					const tokens = writer.getStats().tokenCount - tokensBeforeBody;
					node.treeAnnotation = { ...node.treeAnnotation, tokens };
				}

				await writer.write("}");
				contentTokensUsed = writer.getStats().tokenCount;
			}

			await writer.write("]");
		}

		if (!writeRootBeforeFiles)
			await writer.write(`,"root":${JSON.stringify(effectiveRoot)}`);

		if (todoCollector) {
			const todos = todoCollector.getEntries();
			if (todos.length > 0) {
				await writer.write(`,"todos":${JSON.stringify(todos)}`);
				if (todoCollector.truncated)
					await writer.write(',"todosTruncated":true');
			}
		}

		applyOmittedStats(result, renderOmitted);
		const omittedFilesResult = collectOmittedFiles(result.root);
		if (omittedFilesResult.total > 0) {
			await writer.write(
				`,"omittedFiles":${JSON.stringify(omittedFilesResult.files)}`,
			);
			await writer.write(`,"omittedFilesTotal":${omittedFilesResult.total}`);
			if (omittedFilesResult.truncated)
				await writer.write(',"omittedFilesTruncated":true');
		}
		const {
			outputSizeBytes: _outputSizeBytes,
			outputTokenCount: _outputTokenCount,
			...statsForJson
		} = result.stats;
		await writer.write(`,"stats":${JSON.stringify(statsForJson)}`);
		await writer.write("}");

		await finalizeWriter(writer, result);
	} catch (error) {
		await finalizeWriter(writer, result, error);
	}

	logOmittedSummary(result, logger);
}
