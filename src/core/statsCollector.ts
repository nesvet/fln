import { extname } from "node:path";
import type { FileNode } from "./types.js";

export type ExtensionBreakdownEntry = {
	ext: string;
	files: number;
	bytes: number;
};

function normalizeExtensionLabel(name: string): string {
	const raw = extname(name);
	if (!raw) return "";

	return raw.startsWith(".") ? raw.slice(1) : raw;
}

function isIncludedFile(node: FileNode): boolean {
	return node.type === "file" && !node.isBinary && !node.skipReason;
}

export function sumIncludedFileBytes(root: FileNode): number {
	let total = 0;

	function walk(node: FileNode) {
		if (isIncludedFile(node)) total += node.size;

		if (node.children) for (const child of node.children) walk(child);
	}

	walk(root);

	return total;
}

export function collectExtensionBreakdown(
	root: FileNode,
): ExtensionBreakdownEntry[] {
	const byExt = new Map<string, { files: number; bytes: number }>();

	function walk(node: FileNode) {
		if (isIncludedFile(node)) {
			const ext = normalizeExtensionLabel(node.name);
			const current = byExt.get(ext) ?? { files: 0, bytes: 0 };
			current.files++;
			current.bytes += node.size;
			byExt.set(ext, current);
		}

		if (node.children) for (const child of node.children) walk(child);
	}

	walk(root);

	return [...byExt.entries()]
		.map(([ext, stats]) => ({ ext, files: stats.files, bytes: stats.bytes }))
		.sort((left, right) => right.bytes - left.bytes);
}

export function collectExtensionStats(root: FileNode): Map<string, number> {
	const stats = new Map<string, number>();

	function walk(node: FileNode) {
		if (node.type === "file" && !node.isBinary && !node.skipReason) {
			const ext = extname(node.name) || "(no ext)";
			stats.set(ext, (stats.get(ext) || 0) + 1);
		}

		if (node.children) for (const child of node.children) walk(child);
	}

	walk(root);

	return stats;
}

export function collectProcessedFiles(root: FileNode): string[] {
	const files: string[] = [];

	function walk(node: FileNode, parentPath = "") {
		const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

		if (node.type === "file" && !node.isBinary && !node.skipReason)
			files.push(currentPath);

		if (node.children)
			for (const child of node.children) walk(child, currentPath);
	}

	walk(root);

	return files;
}
