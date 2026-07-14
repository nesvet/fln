import type { TokenModel } from "./tokenBudget.js";

const ESTIMATE_CHARS_PER_TOKEN = 4.7;
const GPT_CHARS_PER_TOKEN = 4;

export function estimateTokensFromBytes(
	bytes: number,
	model: TokenModel,
): number {
	if (bytes <= 0) return 0;

	const charsPerToken =
		model === "gpt-4" || model === "gpt-4o"
			? GPT_CHARS_PER_TOKEN
			: ESTIMATE_CHARS_PER_TOKEN;

	return Math.ceil(bytes / charsPerToken);
}
