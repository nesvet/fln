import { extname } from "node:path";
import type { FileNode } from "./types";


export function collectExtensionStats(root: FileNode): Map<string, number> {
	const stats = new Map<string, number>();
	
	function walk(node: FileNode) {
		if (node.type === "file" && !node.isBinary && !node.skipReason) {
			const ext = extname(node.name) || "(no ext)";
			stats.set(ext, (stats.get(ext) || 0) + 1);
		}
		
		if (node.children)
			for (const child of node.children)
				walk(child);
		
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
			for (const child of node.children)
				walk(child, currentPath);
		
	}
	
	walk(root);
	
	return files;
}
