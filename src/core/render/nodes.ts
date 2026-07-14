import type { FileNode } from "../types.js";

export function filterAndCollectFileNodes(node: FileNode): {
	filtered: FileNode | undefined;
	fileNodes: FileNode[];
} {
	if (node.skipReason) return { filtered: undefined, fileNodes: [] };

	if (node.type === "file") return { filtered: node, fileNodes: [node] };

	const allFileNodes: FileNode[] = [];
	const filteredChildren: FileNode[] = [];
	for (const child of node.children ?? []) {
		const { filtered, fileNodes } = filterAndCollectFileNodes(child);
		allFileNodes.push(...fileNodes);
		if (filtered) filteredChildren.push(filtered);
	}

	if (filteredChildren.length === 0)
		return { filtered: undefined, fileNodes: allFileNodes };

	return {
		filtered: { ...node, children: filteredChildren },
		fileNodes: allFileNodes,
	};
}
