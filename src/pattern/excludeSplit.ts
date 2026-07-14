import { normalizeExcludePattern } from "./normalize.js";

export type SplitExcludePatternsResult = {
	positive: string[];
	unignore: string[];
};

export function splitExcludePatterns(
	patterns: string[],
	input: string,
): SplitExcludePatternsResult {
	const positive: string[] = [];
	const unignore: string[] = [];

	for (const pattern of patterns) {
		const normalized = normalizeExcludePattern(pattern, input);
		if (normalized === null) continue;

		if (normalized.startsWith("!")) unignore.push(normalized.slice(1));
		else positive.push(normalized);
	}

	return { positive, unignore };
}
