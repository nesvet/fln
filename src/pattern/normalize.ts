import { stripLeadingDotSlash, toCanonicalRelative } from "../path/index.js";


const GLOB_CHARS = /[*?[\]{}]/;

function normalizePatternBody(
	pattern: string,
	base: string,
	options: { handleNegation: boolean }
): string | null {
	const trimmed = pattern.trim();
	if (trimmed === "")
		return null;
	
	let isNegated = false;
	let body: string;
	
	if (options.handleNegation) {
		const isEscaped = trimmed.startsWith("\\") && (trimmed[1] === "!" || trimmed[1] === "#");
		const rawPattern = isEscaped ? trimmed.slice(1) : trimmed;
		body = rawPattern;
		if (!isEscaped)
			while (body.startsWith("!")) {
				isNegated = !isNegated;
				body = body.slice(1);
			}
	} else
		body = trimmed;
	
	
	if (body === "")
		return null;
	
	const withoutLeadingSlash = body.startsWith("/") ? body.slice(1) : body;
	const withoutLeadingDot = stripLeadingDotSlash(withoutLeadingSlash);
	const trimmedTrailingSlash = withoutLeadingDot.endsWith("/") ? withoutLeadingDot.slice(0, -1) : withoutLeadingDot;
	
	const globIndex = trimmedTrailingSlash.search(GLOB_CHARS);
	const pathPrefix = globIndex >= 0 ? trimmedTrailingSlash.slice(0, globIndex) : trimmedTrailingSlash;
	const globSuffix = globIndex >= 0 ? trimmedTrailingSlash.slice(globIndex) : "";
	
	const pathPart = pathPrefix.includes("/") ? pathPrefix : (pathPrefix || "");
	const canonical = pathPart === "" ? "" : toCanonicalRelative(pathPart, base);
	
	if (canonical === null)
		return null;
	
	const separator = pathPrefix.endsWith("/") ? "/" : "";
	const normalized = canonical + separator + globSuffix;
	const result = normalized.includes("/") ? normalized : (normalized ? `**/${normalized}` : normalized);
	
	return options.handleNegation && isNegated ? `!${result}` : result;
}

export function normalizeExcludePattern(pattern: string, base: string): string | null {
	return normalizePatternBody(pattern, base, { handleNegation: true });
}

export function normalizeIncludePattern(pattern: string, base: string): string | null {
	return normalizePatternBody(pattern, base, { handleNegation: false });
}
