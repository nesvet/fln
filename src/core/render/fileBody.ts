import { join } from "node:path";
import type { FlnConfig } from "../../config/index.js";
import { flnError, getFileUnifiedDiff } from "../../infra/index.js";
import { compressContent } from "../compress.js";
import { checkToctou, readTextFile } from "../fileContent.js";
import { isSignatureExtractionSupported } from "../signatures.js";
import {
	writeJsonContentFromPath,
	writeJsonStringField,
} from "../streamJson.js";
import { streamTextFileToWriter } from "../textStream.js";
import type { AnnotateTreeMode, FileNode } from "../types.js";
import type { TodoCollector } from "./todoCollector.js";
import type { RenderLogger } from "./types.js";
import type { OutputWriter } from "./writer.js";

export type FileBodyHooks = {
	todoCollector?: TodoCollector;
	annotateTree?: AnnotateTreeMode;
};

function countLines(text: string): number {
	if (!text) return 0;

	let count = 0;
	for (const char of text) if (char === "\n") count++;
	if (!text.endsWith("\n")) count++;

	return count;
}

function setLineAnnotation(
	node: FileNode,
	annotateTree: AnnotateTreeMode | undefined,
	lineCount: number,
): void {
	if (annotateTree !== "lines" || lineCount <= 0) return;

	node.treeAnnotation = { ...node.treeAnnotation, lines: lineCount };
}

async function writeTextContent(
	writer: OutputWriter,
	content: string,
	node: FileNode,
	hooks: FileBodyHooks,
): Promise<void> {
	const normalized =
		content.length > 0 && !content.endsWith("\n") ? `${content}\n` : content;
	if (hooks.todoCollector) hooks.todoCollector.scanText(content, node.path);
	setLineAnnotation(node, hooks.annotateTree, countLines(content));
	await writer.write(normalized);
}

async function warnToctou(
	node: FileNode,
	absolutePath: string,
	config: FlnConfig,
	logger: RenderLogger,
): Promise<void> {
	if (node.scanMtimeMs === undefined || node.scanSize === undefined) return;

	let changed: boolean;
	try {
		changed = await checkToctou(absolutePath, node.scanMtimeMs, node.scanSize);
	} catch {
		return;
	}

	if (!changed) return;

	if (config.strictToctou)
		throw flnError("TOCTOU", `File changed since scan: ${node.path}`, {
			hint: "Re-run fln to produce a consistent snapshot, or drop --strict-toctou to degrade to a warning.",
		});

	logger.warn(`File changed since scan: ${node.path}`);
}

export async function writeMarkdownFileBody(
	writer: OutputWriter,
	node: FileNode,
	config: FlnConfig,
	logger: RenderLogger,
	diffCache?: Map<string, string>,
	hooks: FileBodyHooks = {},
): Promise<void> {
	const absolutePath = join(config.input, node.path);
	await warnToctou(node, absolutePath, config, logger);

	if (config.diffHunks && config.since) {
		const diff = diffCache
			? diffCache.get(node.path)
			: getFileUnifiedDiff(config.since, node.path, config.input);
		if (diff) {
			await writeTextContent(writer, diff, node, hooks);

			return;
		}
	}

	if (config.outline) {
		const outlineBody =
			node.size > config.maxFileSize
				? `(file too large for outline: ${node.size} bytes)`
				: await renderOutlineBody(absolutePath, node, config, logger);
		await writeTextContent(writer, outlineBody, node, hooks);

		return;
	}

	if (
		config.compress &&
		isSignatureExtractionSupported(node.name) &&
		node.size <= config.maxFileSize
	) {
		const { text, hadReplacement } = await readTextFile(
			absolutePath,
			config.encoding,
		);
		if (hadReplacement)
			logger.warn(`Encoding replacement characters in ${node.path}`);
		await writeTextContent(
			writer,
			compressContent(text, node.name),
			node,
			hooks,
		);

		return;
	}

	if (config.compress)
		logger.debug(
			`Compress unavailable for ${node.name}; streaming full content.`,
		);

	let endsWithNewline = false;
	let lineCount = 0;
	let wroteContent = false;
	let scanLineNumber = 1;
	let pendingLine = "";
	const { hadReplacement } = await streamTextFileToWriter(
		absolutePath,
		config.encoding,
		async (chunk) => {
			wroteContent = true;
			if (hooks.annotateTree === "lines")
				for (const char of chunk) if (char === "\n") lineCount++;

			if (hooks.todoCollector) {
				const text = pendingLine + chunk;
				const lines = text.split("\n");
				pendingLine = lines.pop() ?? "";
				for (const line of lines) {
					hooks.todoCollector.scanLine(line, node.path, scanLineNumber);
					scanLineNumber++;
				}
			}

			await writer.write(chunk);
			endsWithNewline = chunk.endsWith("\n");
		},
	);
	if (hooks.todoCollector && pendingLine.length > 0)
		hooks.todoCollector.scanLine(pendingLine, node.path, scanLineNumber);
	if (hooks.annotateTree === "lines" && wroteContent && !endsWithNewline)
		lineCount++;
	if (hadReplacement)
		logger.warn(`Encoding replacement characters in ${node.path}`);
	if (!endsWithNewline) await writer.write("\n");
	setLineAnnotation(node, hooks.annotateTree, lineCount);
}

async function renderOutlineBody(
	absolutePath: string,
	node: FileNode,
	config: FlnConfig,
	logger: RenderLogger,
): Promise<string> {
	if (!isSignatureExtractionSupported(node.name))
		return `(no signature extractor for ${node.name})`;
	const { text, hadReplacement } = await readTextFile(
		absolutePath,
		config.encoding,
	);
	if (hadReplacement)
		logger.warn(`Encoding replacement characters in ${node.path}`);

	return compressContent(text, node.name);
}

export async function writeJsonFileBody(
	writer: OutputWriter,
	node: FileNode,
	config: FlnConfig,
	logger: RenderLogger,
	diffCache?: Map<string, string>,
	hooks: FileBodyHooks = {},
): Promise<void> {
	const absolutePath = join(config.input, node.path);
	await warnToctou(node, absolutePath, config, logger);

	if (config.diffHunks && config.since) {
		const diff = diffCache
			? diffCache.get(node.path)
			: getFileUnifiedDiff(config.since, node.path, config.input);
		if (diff) {
			if (hooks.todoCollector) hooks.todoCollector.scanText(diff, node.path);
			setLineAnnotation(node, hooks.annotateTree, countLines(diff));
			await writer.write(",");
			await writeJsonStringField(writer, "content", diff);

			return;
		}
	}

	if (config.outline) {
		const outlineBody =
			node.size > config.maxFileSize
				? `(file too large for outline: ${node.size} bytes)`
				: await renderOutlineBody(absolutePath, node, config, logger);
		if (hooks.todoCollector)
			hooks.todoCollector.scanText(outlineBody, node.path);
		setLineAnnotation(node, hooks.annotateTree, countLines(outlineBody));
		await writer.write(",");
		await writeJsonStringField(writer, "content", outlineBody);

		return;
	}

	if (
		config.compress &&
		isSignatureExtractionSupported(node.name) &&
		node.size <= config.maxFileSize
	) {
		const { text, hadReplacement } = await readTextFile(
			absolutePath,
			config.encoding,
		);
		if (hadReplacement)
			logger.warn(`Encoding replacement characters in ${node.path}`);
		const compressed = compressContent(text, node.name);
		if (hooks.todoCollector)
			hooks.todoCollector.scanText(compressed, node.path);
		setLineAnnotation(node, hooks.annotateTree, countLines(compressed));
		await writer.write(",");
		await writeJsonStringField(writer, "content", compressed);

		return;
	}

	if (config.compress)
		logger.debug(
			`Compress unavailable for ${node.name}; streaming full content.`,
		);

	let lineCount = 0;
	let wroteContent = false;
	let endsWithNewline = false;
	let scanLineNumber = 1;
	let pendingLine = "";
	const { hadReplacement } = await writeJsonContentFromPath(
		writer,
		absolutePath,
		config.encoding,
		{
			leadingComma: true,
			onChunk: (chunk) => {
				wroteContent = true;
				endsWithNewline = chunk.endsWith("\n");
				if (hooks.annotateTree === "lines")
					for (const char of chunk) if (char === "\n") lineCount++;

				if (hooks.todoCollector) {
					const text = pendingLine + chunk;
					const lines = text.split("\n");
					pendingLine = lines.pop() ?? "";
					for (const line of lines) {
						hooks.todoCollector.scanLine(line, node.path, scanLineNumber);
						scanLineNumber++;
					}
				}
			},
		},
	);
	if (hooks.todoCollector && pendingLine.length > 0)
		hooks.todoCollector.scanLine(pendingLine, node.path, scanLineNumber);
	if (hooks.annotateTree === "lines" && wroteContent && !endsWithNewline)
		lineCount++;
	setLineAnnotation(node, hooks.annotateTree, lineCount);
	if (hadReplacement)
		logger.warn(`Encoding replacement characters in ${node.path}`);
}
