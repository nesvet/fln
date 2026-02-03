import type { FileNode } from "./types";


function formatNodeSuffix(node: FileNode): string {
	if (node.type === "symlink")
		return node.target ? ` → ${node.target}` : " → [unknown]";
	
	return "";
}

export function renderTree(root: FileNode): string {
	if (!root.children || root.children.length === 0)
		return "";
	
	return root.children
		.map((child, index) => renderTreeNode(child, "", index === root.children!.length - 1))
		.join("");
}

function renderTreeNode(node: FileNode, prefix: string, isLast: boolean): string {
	const connector = isLast ? "└── " : "├── ";
	const line = `${prefix}${connector}${node.name}${formatNodeSuffix(node)}\n`;
	
	if (!node.children || node.children.length === 0)
		return line;
	
	const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
	const childLines = node.children
		.map((child, index) => renderTreeNode(child, childPrefix, index === node.children!.length - 1))
		.join("");
	
	return `${line}${childLines}`;
}
