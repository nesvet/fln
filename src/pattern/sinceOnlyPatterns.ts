import ignore from "ignore";
import { filterPathsUnderBase, getChangedFilesSince } from "../infra/index.js";
import { normalizeIncludePattern } from "./normalize.js";

export type SinceFilterValues = {
	since?: string;
	ext?: string;
	only?: string[];
	include?: string[];
};

export type SinceOnlyPatternsResult = {
	only: string[];
	onlyMode: boolean;
	sinceFiltered: string[];
};

export function buildSinceOnlyPatterns(
	values: SinceFilterValues,
	input: string,
	cwd: string,
): SinceOnlyPatternsResult {
	const sincePatterns = values.since
		? filterPathsUnderBase(getChangedFilesSince(values.since, cwd), cwd, input)
		: [];
	const extPatterns = values.ext
		? values.ext
				.split(",")
				.map((ext) => `**/*.${ext.trim().replace(/^\./, "")}`)
				.filter(Boolean)
		: [];
	const sinceFiltered =
		values.since && values.ext
			? (() => {
					const normalized = extPatterns
						.map((pattern) => normalizeIncludePattern(pattern, input))
						.filter((pattern): pattern is string => pattern !== null);

					if (normalized.length === 0) return sincePatterns;
					const extMatcher = ignore().add(normalized);

					return sincePatterns.filter((path) => extMatcher.ignores(path));
				})()
			: sincePatterns;

	const only =
		values.since && values.ext
			? [...sinceFiltered, ...(values.only ?? [])]
			: [...sinceFiltered, ...extPatterns, ...(values.only ?? [])];
	const onlyMode = Boolean(
		values.since || values.ext || (values.only?.length ?? 0) > 0,
	);

	return { only, onlyMode, sinceFiltered };
}

export function formatNoChangesSinceMessage(
	since: string,
	ext?: string,
): string {
	const extSuffix = ext ? ` matching --ext ${ext}` : "";

	return `No changed files since ${since}${extSuffix}`;
}

export function shouldExitForEmptySince(
	values: SinceFilterValues,
	sinceFiltered: string[],
): boolean {
	return Boolean(
		values.since &&
			sinceFiltered.length === 0 &&
			!(values.only?.length ?? 0) &&
			!(values.include?.length ?? 0),
	);
}
