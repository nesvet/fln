import { collapseTreeLine } from "./compress.js";
import { formatByteSize } from "./size.js";
import type { AnnotateTreeMode, FileNode } from "./types.js";

type RenderTreeOptions = {
	compress?: boolean;
	annotate?: AnnotateTreeMode;
};

function formatNodeSuffix(node: FileNode): string {
	if (node.type === "symlink")
		return node.target ? ` → ${node.target}` : " → [unknown]";

	return "";
}

function formatTreeLine(line: string, compress: boolean): string {
	return compress ? collapseTreeLine(line) : line;
}

function sumChildAnnotation(
	node: FileNode,
	mode: AnnotateTreeMode,
	field: "lines" | "tokens",
): number {
	return (node.children ?? []).reduce(
		(sum, child) => sum + getAnnotationValue(child, mode, field),
		0,
	);
}

function sumChildSizes(node: FileNode): number {
	return (node.children ?? []).reduce((sum, child) => {
		if (child.type === "file") return child.skipReason ? sum : sum + child.size;

		return sum + sumChildSizes(child);
	}, 0);
}

function getAnnotationValue(
	node: FileNode,
	mode: AnnotateTreeMode,
	field: "lines" | "tokens",
): number {
	if (mode === "size")
		return node.type === "file" ? node.size : sumChildSizes(node);

	if (node.type === "file") return node.treeAnnotation?.[field] ?? 0;

	return sumChildAnnotation(node, mode, field);
}

function formatAnnotationSuffix(
	node: FileNode,
	mode: AnnotateTreeMode,
): string {
	if (mode === "size") {
		const size = node.type === "file" ? node.size : sumChildSizes(node);
		if (size <= 0) return "";

		return ` (${formatByteSize(size)})`;
	}

	if (mode === "tokens") {
		const tokens = getAnnotationValue(node, mode, "tokens");
		if (tokens <= 0) return "";

		return ` (${tokens.toLocaleString()} tokens)`;
	}

	const lines = getAnnotationValue(node, mode, "lines");
	if (lines <= 0) return "";

	return ` (${lines.toLocaleString()} lines)`;
}

export function renderTree(
	root: FileNode,
	options: RenderTreeOptions = {},
): string {
	if (!root.children || root.children.length === 0) return "";

	const compress = options.compress ?? false;
	const annotate = options.annotate;

	const children = root.children;

	return children
		.map((child, index) =>
			renderTreeNode(
				child,
				"",
				index === children.length - 1,
				compress,
				annotate,
			),
		)
		.join("");
}

function renderTreeNode(
	node: FileNode,
	prefix: string,
	isLast: boolean,
	compress: boolean,
	annotate: AnnotateTreeMode | undefined,
): string {
	const connector = isLast ? "└── " : "├── ";
	const annotation = annotate ? formatAnnotationSuffix(node, annotate) : "";
	const line = formatTreeLine(
		`${prefix}${connector}${node.name}${formatNodeSuffix(node)}${annotation}\n`,
		compress,
	);

	if (!node.children || node.children.length === 0) return line;

	const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
	const nodeChildren = node.children;
	const childLines = nodeChildren
		.map((child, index) =>
			renderTreeNode(
				child,
				childPrefix,
				index === nodeChildren.length - 1,
				compress,
				annotate,
			),
		)
		.join("");

	return `${line}${childLines}`;
}
