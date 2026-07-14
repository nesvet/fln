import type {
	FileNode,
	OmittedFile,
	ScanResult,
	SkipReason,
} from "../types.js";
import type { RenderLogger } from "./types.js";

export const OMITTED_FILES_CAP = 1000;

function collectOmittedByReason(
	node: FileNode,
	counts: Map<SkipReason, number>,
): void {
	if (node.skipReason)
		counts.set(node.skipReason, (counts.get(node.skipReason) ?? 0) + 1);

	for (const child of node.children ?? [])
		collectOmittedByReason(child, counts);
}

function mergeOmittedCounts(
	target: Map<SkipReason, number>,
	source: Map<SkipReason, number>,
): void {
	for (const [reason, count] of source)
		target.set(reason, (target.get(reason) ?? 0) + count);
}

function formatOmittedSummary(counts: Map<SkipReason, number>): string {
	const labels: Record<SkipReason, string> = {
		generated: "generated",
		readError: "read error",
		security: "security",
		symlinkCycle: "symlink cycle",
		symlinkEscape: "symlink escape",
		tokenLimit: "token limit",
		tooLarge: "too large",
		totalSizeLimit: "output size",
	};

	return [...counts.entries()]
		.filter(([, count]) => count > 0)
		.map(([reason, count]) => `${count} ${labels[reason]}`)
		.join(", ");
}

export function collectSkipReasonCounts(
	node: FileNode,
	counts: Map<SkipReason, number> = new Map(),
): Map<SkipReason, number> {
	collectOmittedByReason(node, counts);

	return counts;
}

export function applyOmittedStats(
	result: ScanResult,
	renderOmitted: Map<SkipReason, number>,
): void {
	const treeOmitted = new Map<SkipReason, number>();
	collectOmittedByReason(result.root, treeOmitted);
	mergeOmittedCounts(treeOmitted, renderOmitted);

	const omittedByReason: Partial<Record<SkipReason, number>> = {};
	let total = 0;
	for (const [reason, count] of treeOmitted) {
		omittedByReason[reason] = count;
		total += count;
	}

	if (total > 0) result.stats.omittedByReason = omittedByReason;
}

export function collectOmittedFiles(
	root: FileNode,
	cap = OMITTED_FILES_CAP,
): {
	files: OmittedFile[];
	truncated: boolean;
	total: number;
} {
	const all: OmittedFile[] = [];
	const walk = (node: FileNode): void => {
		if (node.type === "file" && node.skipReason)
			all.push({ path: node.path, reason: node.skipReason, size: node.size });
		for (const child of node.children ?? []) walk(child);
	};
	walk(root);
	all.sort((a, b) => b.size - a.size);

	const total = all.length;

	return { files: all.slice(0, cap), truncated: total > cap, total };
}

export function logOmittedSummary(
	result: ScanResult,
	logger: RenderLogger,
): void {
	const counts = new Map<SkipReason, number>();
	if (result.stats.omittedByReason)
		for (const [reason, count] of Object.entries(
			result.stats.omittedByReason,
		) as [SkipReason, number][])
			counts.set(reason, count);

	const summary = formatOmittedSummary(counts);
	if (summary) logger.debug(`Omitted files: ${summary}`);
}
