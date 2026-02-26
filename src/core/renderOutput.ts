import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createOutputWriter, formatDateTime } from "../infra/index.js";
import { VERSION } from "../version.js";
import type { FlnConfig } from "../config/index.js";
import { renderTree } from "./renderTree.js";
import { formatByteSize } from "./size.js";
import type { FileNode, ScanResult } from "./types.js";


function getLanguageFromFilename(fileName: string): string {
	const extension = extname(fileName).replace(".", "");
	
	return extension === "" ? "txt" : extension;
}

async function findMaxBacktickSequenceInFile(filePath: string): Promise<number> {
	const readStream = createReadStream(filePath, { encoding: "utf8" });
	let maxLength = 0;
	let currentLength = 0;
	let carry = "";
	
	for await (const chunk of readStream) {
		const textChunk = typeof chunk === "string" ? chunk : chunk.toString("utf8");
		const combined = carry + textChunk;
		
		const safeLength = Math.max(combined.length - 1, 0);
		
		for (let i = 0; i < safeLength; i++)
			if (combined[i] === "`") {
				currentLength++;
				maxLength = Math.max(maxLength, currentLength);
			} else
				currentLength = 0;
		
		
		carry = combined.slice(safeLength);
	}
	
	for (const char of carry)
		if (char === "`") {
			currentLength++;
			maxLength = Math.max(maxLength, currentLength);
		} else
			currentLength = 0;
	
	
	return maxLength;
}

async function writeMarkdownContent(
	writer: Awaited<ReturnType<typeof createOutputWriter>>,
	filePath: string
): Promise<void> {
	const readStream = createReadStream(filePath, { encoding: "utf8" });
	let lastCharacter = "";
	
	for await (const chunk of readStream) {
		const textChunk = typeof chunk === "string" ? chunk : chunk.toString("utf8");
		await writer.write(textChunk);
		
		if (textChunk.length > 0)
			lastCharacter = textChunk.at(-1) ?? "";
	}
	
	if (lastCharacter !== "" && lastCharacter !== "\n")
		await writer.write("\n");
}

function filterAndCollectFileNodes(node: FileNode): {
	filtered: FileNode | undefined;
	fileNodes: FileNode[];
} {
	if (node.skipReason)
		return { filtered: undefined, fileNodes: [] };
	
	if (node.type === "file")
		return { filtered: { ...node }, fileNodes: [ node ] };
	
	const allFileNodes: FileNode[] = [];
	const filteredChildren: FileNode[] = [];
	for (const child of node.children ?? []) {
		const { filtered, fileNodes } = filterAndCollectFileNodes(child);
		allFileNodes.push(...fileNodes);
		if (filtered)
			filteredChildren.push(filtered);
	}
	
	if (filteredChildren.length === 0)
		return { filtered: undefined, fileNodes: allFileNodes };
	
	return {
		filtered: { ...node, children: filteredChildren },
		fileNodes: allFileNodes
	};
}

async function writeMarkdown(result: ScanResult, config: FlnConfig): Promise<void> {
	const writer = await createOutputWriter(config.output, config.maxTotalSize);
	const { filtered: outputRoot, fileNodes } = filterAndCollectFileNodes(result.root);
	const effectiveRoot = outputRoot ?? { ...result.root, children: [] };
	
	try {
		if (config.output !== "-") {
			await writer.writeLine(`<!-- 🥞 fln ${VERSION} -->`);
			await writer.writeLine("");
		}
		await writer.writeLine(`# Codebase Snapshot: ${result.projectName}`);
		await writer.writeLine("");
		await writer.writeLine(`Generated: ${config.date ?? formatDateTime()}  `);
		await writer.writeLine(`Files: ${result.stats.files} | Directories: ${result.stats.directories}`);
		await writer.writeLine("");
		await writer.writeLine("---");
		await writer.writeLine("");
		
		if (config.banner) {
			await writer.writeLine(config.banner);
			await writer.writeLine("");
		}
		
		if (config.includeTree) {
			await writer.writeLine("## Directory Tree");
			await writer.writeLine("```text");
			await writer.write(renderTree(effectiveRoot));
			await writer.writeLine("```");
			await writer.writeLine("");
			await writer.writeLine("---");
			await writer.writeLine("");
		}
		
		if (config.includeContents && fileNodes.length > 0)
			await writeMarkdownFiles(fileNodes, writer, config);
		
		if (config.footer) {
			await writer.writeLine("");
			await writer.writeLine(config.footer);
		}
		
		({
			sizeBytes: result.stats.outputSizeBytes,
			tokenCount: result.stats.outputTokenCount
		} = await writer.close());
	} catch (error) {
		await writer.close();
		
		throw error;
	}
}

async function writeMarkdownFiles(
	fileNodes: FileNode[],
	outputWriter: Awaited<ReturnType<typeof createOutputWriter>>,
	renderConfig: FlnConfig
): Promise<void> {
	await outputWriter.writeLine("## Source Files");
	await outputWriter.writeLine("");
	
	for (let i = 0; i < fileNodes.length; i++) {
		const node = fileNodes[i];
		const language = getLanguageFromFilename(node.name);
		const isLastFile = i === fileNodes.length - 1;
		const filePath = join(renderConfig.input, node.path);
		
		let fenceLength = 3;
		if (!node.isBinary)
			try {
				const maxBackticks = await findMaxBacktickSequenceInFile(filePath);
				if (maxBackticks >= 3)
					fenceLength = maxBackticks + 1;
			} catch {}
		
		const fence = "`".repeat(fenceLength);
		
		await outputWriter.writeLine(`### ${node.path}`);
		await outputWriter.writeLine(`${fence}${language}`);
		
		if (node.isBinary)
			await outputWriter.writeLine(`[BINARY FILE: ${formatByteSize(node.size)}]`);
		else
			try {
				await writeMarkdownContent(outputWriter, filePath);
			} catch {
				await outputWriter.writeLine("[READ ERROR]");
			}
		
		await outputWriter.writeLine(fence);
		
		if (!isLastFile)
			await outputWriter.writeLine("");
	}
}

async function writeJson(result: ScanResult, config: FlnConfig): Promise<void> {
	const writer = await createOutputWriter(config.output, config.maxTotalSize);
	const { filtered: outputRoot, fileNodes } = filterAndCollectFileNodes(result.root);
	const effectiveRoot = outputRoot ?? { ...result.root, children: [] };
	
	try {
		await writer.write("{");
		await writer.write(`"version":${JSON.stringify(VERSION)}`);
		await writer.write(`,"generated":${JSON.stringify(config.date ?? formatDateTime())}`);
		await writer.write(`,"projectName":${JSON.stringify(result.projectName)}`);
		// TODO(major): remove rootDirectory from JSON output
		await writer.write(`,"input":${JSON.stringify(config.input)}`);
		await writer.write(`,"rootDirectory":${JSON.stringify(config.input)}`);
		const { outputSizeBytes: _, outputTokenCount: __, ...statsForJson } = result.stats;
		await writer.write(`,"stats":${JSON.stringify(statsForJson)}`);
		await writer.write(`,"options":${JSON.stringify({
			includeTree: config.includeTree,
			includeContents: config.includeContents,
			format: config.format,
			maxFileSize: config.maxFileSize,
			maxTotalSize: config.maxTotalSize,
			includeHidden: config.includeHidden,
			gitignore: config.gitignore,
			excludePatterns: config.excludePatterns,
			includePatterns: config.includePatterns,
			followSymlinks: config.followSymlinks,
			banner: config.banner,
			footer: config.footer
		})}`);
		await writer.write(`,"tree":${JSON.stringify(effectiveRoot)}`);
		
		if (config.includeContents) {
			await writer.write(",\"files\":[");
			
			let isFirst = true;
			for (const node of fileNodes) {
				if (!isFirst)
					await writer.write(",");
				
				isFirst = false;
				
				await writer.write("{");
				await writer.write(`"path":${JSON.stringify(node.path)}`);
				await writer.write(`,"language":${JSON.stringify(getLanguageFromFilename(node.name))}`);
				await writer.write(`,"isBinary":${JSON.stringify(Boolean(node.isBinary))}`);
				
				if (node.isBinary)
					await writer.write(",\"content\":null");
				else
					try {
						const filePath = join(config.input, node.path);
						const content = await readFile(filePath, "utf8");
						
						await writer.write(`,"content":${JSON.stringify(content)}`);
					} catch {
						await writer.write(",\"skipReason\":\"readError\",\"content\":null");
					}
				
				await writer.write("}");
			}
			
			await writer.write("]");
		}
		
		await writer.write("}");
		
		({
			sizeBytes: result.stats.outputSizeBytes,
			tokenCount: result.stats.outputTokenCount
		} = await writer.close());
	} catch (error) {
		await writer.close();
		
		throw error;
	}
}

export async function writeOutput(result: ScanResult, config: FlnConfig): Promise<void> {
	if (config.format === "json")
		await writeJson(result, config);
	else
		await writeMarkdown(result, config);
}
