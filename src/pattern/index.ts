export {
	type SplitExcludePatternsResult,
	splitExcludePatterns,
} from "./excludeSplit.js";
export {
	normalizeExcludePattern,
	normalizeIncludePattern,
} from "./normalize.js";
export {
	buildSinceOnlyPatterns,
	formatNoChangesSinceMessage,
	type SinceFilterValues,
	type SinceOnlyPatternsResult,
	shouldExitForEmptySince,
} from "./sinceOnlyPatterns.js";
