import type { FlnConfig } from "../../config/index.js";
import { flnError } from "../../infra/flnError.js";
import type { FileNode, SkipReason } from "../types.js";
import type { OutputWriter } from "./writer.js";

export function isTokenBudgetExceeded(
	writer: OutputWriter,
	maxTokens: number,
	contentTokensUsed: number,
	maxContentTokens: number,
): boolean {
	if (maxContentTokens > 0) return contentTokensUsed >= maxContentTokens;

	return maxTokens > 0 && writer.getStats().tokenCount >= maxTokens;
}

function throwIfStrictLimit(
	config: FlnConfig,
	node: FileNode,
	reason: SkipReason,
): void {
	if (config.strictLimits)
		throw flnError("LIMIT_EXCEEDED", `${reason} — omitted ${node.path}`, {
			path: node.path,
		});
}

export function markLimitSkip(
	node: FileNode,
	reason: SkipReason,
	config: FlnConfig,
): void {
	node.skipReason = reason;
	throwIfStrictLimit(config, node, reason);
}
