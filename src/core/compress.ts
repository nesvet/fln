import {
	extractSignatures,
	isSignatureExtractionSupported,
} from "./signatures.js";

const jsCommentPattern =
	/"(?:\\[\S\s]|[^"\\])*"|'(?:\\[\S\s]|[^'\\])*"|`(?:\\[\S\s]|[^\\`])*`|\/\*[\S\s]*?\*\/|\/\/[^\n]*/g;

const cssCommentPattern =
	/"(?:\\[\S\s]|[^"\\])*"|'(?:\\[\S\s]|[^'\\])*'|\/\*[\S\s]*?\*\//g;

function stripCommentsStringAware(content: string, pattern: RegExp): string {
	return content.replace(pattern, (match) => {
		if (match.startsWith("/*") || match.startsWith("//")) return "";

		return match;
	});
}

export function stripBlockComments(content: string, fileName: string): string {
	const lowerName = fileName.toLowerCase();

	if (lowerName.endsWith(".css"))
		return stripCommentsStringAware(content, cssCommentPattern);

	if (
		lowerName.endsWith(".js") ||
		lowerName.endsWith(".jsx") ||
		lowerName.endsWith(".ts") ||
		lowerName.endsWith(".tsx") ||
		lowerName.endsWith(".mjs") ||
		lowerName.endsWith(".cjs")
	)
		return stripCommentsStringAware(content, jsCommentPattern);

	return content;
}

export function compressContent(content: string, fileName: string): string {
	if (isSignatureExtractionSupported(fileName)) {
		const { text } = extractSignatures(content, fileName);

		return text;
	}

	return stripBlockComments(content, fileName);
}

export function collapseTreeLine(line: string): string {
	return line.replaceAll(/\s{2,}/g, " ").trimEnd();
}
