import {
	explainPath,
	formatPathDecision,
	type PathDecision,
	type PathDecisionReason,
} from "../core/pathDecision.js";
import { type FlnExplainOptions, resolveWhyFromOptions } from "./whyConfig.js";

export type { PathDecision, PathDecisionReason } from "../core/pathDecision.js";
export type { FlnExplainOptions } from "./whyConfig.js";

export type PathDecisionJson = {
	relativePath: string;
	included: boolean;
	reason: PathDecisionReason;
	detail?: string;
};

export type FlnWhyJson = {
	schemaVersion: 1;
	input: string;
	decision: PathDecisionJson;
};

export function toFlnWhyJson(
	input: string,
	decision: PathDecision,
): FlnWhyJson {
	return {
		schemaVersion: 1,
		input,
		decision: {
			relativePath: decision.relativePath,
			included: decision.included,
			reason: decision.reason,
			...(decision.detail === undefined ? {} : { detail: decision.detail }),
		},
	};
}

export async function explain(
	options: FlnExplainOptions,
): Promise<PathDecision> {
	const { explainPathOptions, logger } = await resolveWhyFromOptions(options);

	return explainPath(explainPathOptions, logger);
}

export function formatExplainDecision(decision: PathDecision): string {
	return formatPathDecision(decision);
}
