import { sortFileNodesByPriority } from "../core/filePriority.js";
import type { FileNode } from "../core/types.js";
import { estimateTokensFromBytes } from "../infra/index.js";
import type { TokenModel } from "../infra/tokenBudget.js";

export type FlnDoctorRecommend = {
	exclude: string[];
	projectedTokens: number;
	omittedCount: number;
};

function collectIncludedFileNodes(
	node: FileNode,
	result: FileNode[] = [],
): FileNode[] {
	if (node.type === "file" && !node.skipReason && !node.isBinary)
		result.push(node);
	for (const child of node.children ?? [])
		collectIncludedFileNodes(child, result);

	return result;
}

function toExcludePattern(path: string): string {
	const segments = path.replaceAll("\\", "/").split("/").filter(Boolean);
	if (segments.length > 1) {
		const dir = segments.slice(0, -1).join("/");
		return `${dir}/**`;
	}

	const fileName = segments[0] ?? path;
	if (fileName.includes("."))
		return `**/*${fileName.slice(fileName.lastIndexOf("."))}`;

	return fileName;
}

export function buildRecommendBudget(
	root: FileNode,
	budget: number,
	tokenModel: TokenModel,
): FlnDoctorRecommend {
	const files = collectIncludedFileNodes(root);
	sortFileNodesByPriority(files);
	files.reverse();
	const excludePatterns = new Set<string>();
	let projectedTokens = 0;
	let omittedCount = 0;

	for (const node of files) {
		const fileTokens = estimateTokensFromBytes(node.size, tokenModel);
		if (budget > 0 && projectedTokens + fileTokens > budget) {
			excludePatterns.add(toExcludePattern(node.path));
			omittedCount += 1;

			continue;
		}

		projectedTokens += fileTokens;
	}

	return {
		exclude: [...excludePatterns].sort(),
		projectedTokens,
		omittedCount,
	};
}
