type SignatureResult = {
	text: string;
	hadBodyOmission: boolean;
};

type SignatureExtractor = (content: string) => SignatureResult;

const BODY_OMISSION_MARKER = "⋮--";

type ScanState = {
	inString:
		| "block-comment"
		| "double"
		| "line-comment"
		| "single"
		| "template"
		| false;
	escaped: boolean;
};

function createScanState(): ScanState {
	return { inString: false, escaped: false };
}

function resetScanState(state: ScanState): void {
	state.inString = false;
	state.escaped = false;
}

function scanChar(
	state: ScanState,
	char: string,
	prevChar: string,
): "brace-close" | "brace-open" | "none" {
	if (state.escaped) {
		state.escaped = false;

		return "none";
	}
	if (char === "\\") {
		state.escaped = true;

		return "none";
	}
	if (state.inString) {
		if (state.inString === "single" && char === "'") state.inString = false;
		else if (state.inString === "double" && char === '"')
			state.inString = false;
		else if (state.inString === "template" && char === "`")
			state.inString = false;
		else if (
			state.inString === "block-comment" &&
			char === "*" &&
			prevChar === "/"
		)
			state.inString = false;
		else if (state.inString === "line-comment" && char === "\n")
			state.inString = false;

		return "none";
	}
	switch (char) {
		case "'": {
			state.inString = "single";
			break;
		}
		case '"': {
			state.inString = "double";
			break;
		}
		case "`": {
			state.inString = "template";
			break;
		}
		default:
			if (char === "/" && prevChar === "/") state.inString = "line-comment";
			else if (char === "*" && prevChar === "/")
				state.inString = "block-comment";
			else if (char === "{") return "brace-open";
			else if (char === "}") return "brace-close";
	}

	return "none";
}

function countBracesOnLine(line: string): { open: number; close: number } {
	const state = createScanState();
	let open = 0;
	let close = 0;

	for (let j = 0; j < line.length; j++) {
		const char = line[j];
		const prevChar = j > 0 ? line[j - 1] : "";
		const result = scanChar(state, char, prevChar);
		if (result === "brace-open") open++;
		else if (result === "brace-close") close++;
	}

	return { open, close };
}

function isFunctionDeclaration(trimmed: string): boolean {
	return (
		/^(export\s+)?(default\s+)?(async\s+)?function\s+/.test(trimmed) ||
		/^(export\s+)?(default\s+)?async\s+function\s*\*/.test(trimmed)
	);
}

function isKeepableDeclaration(trimmed: string): boolean {
	return (
		/^(export\s+)?(abstract\s+)?class\s+/.test(trimmed) ||
		/^(export\s+)?interface\s+/.test(trimmed) ||
		/^(export\s+)?type\s+\w+/.test(trimmed) ||
		/^(export\s+)?enum\s+/.test(trimmed) ||
		/^declare\s+/.test(trimmed)
	);
}

function isImportOrExport(trimmed: string): boolean {
	return (
		/^import\s+/.test(trimmed) ||
		/^export\s+.*from\s+/.test(trimmed) ||
		/^export\s*{/.test(trimmed) ||
		/^export\s+\*/.test(trimmed)
	);
}

function isConstOrVar(trimmed: string): boolean {
	return /^(export\s+)?(const|let|var)\s+/.test(trimmed);
}

function isDocComment(trimmed: string): boolean {
	return (
		trimmed.startsWith("/**") ||
		trimmed.startsWith("*") ||
		trimmed.startsWith("*/") ||
		trimmed.startsWith("//") ||
		trimmed.startsWith("/*")
	);
}

function isDecoratorOrAnnotation(trimmed: string): boolean {
	return trimmed.startsWith("@");
}

function extractJsLikeSignatures(content: string): SignatureResult {
	const lines = content.split("\n");
	const output: string[] = [];
	let hadBodyOmission = false;

	let inFunctionBody = false;
	let bodyBraceDepth = 0;
	const braceState = createScanState();

	let inKeepBlock = false;
	let keepBraceDepth = 0;
	const keepState = createScanState();

	for (const line of lines) {
		const trimmed = line.trim();

		if (inFunctionBody) {
			resetScanState(braceState);
			let lineDone = false;
			for (let j = 0; j < line.length && !lineDone; j++) {
				const char = line[j];
				const prevChar = j > 0 ? line[j - 1] : "";
				const result = scanChar(braceState, char, prevChar);
				if (result === "brace-open") bodyBraceDepth++;
				else if (result === "brace-close") {
					bodyBraceDepth--;
					if (bodyBraceDepth <= 0) {
						inFunctionBody = false;
						hadBodyOmission = true;
						output.push(BODY_OMISSION_MARKER);
						lineDone = true;
					}
				}
			}

			continue;
		}

		if (inKeepBlock) {
			output.push(line);
			resetScanState(keepState);
			for (let j = 0; j < line.length; j++) {
				const char = line[j];
				const prevChar = j > 0 ? line[j - 1] : "";
				const result = scanChar(keepState, char, prevChar);
				if (result === "brace-open") keepBraceDepth++;
				else if (result === "brace-close") {
					keepBraceDepth--;
					if (keepBraceDepth <= 0) {
						inKeepBlock = false;

						break;
					}
				}
			}

			continue;
		}

		if (isFunctionDeclaration(trimmed)) {
			output.push(line);
			const { open, close } = countBracesOnLine(line);
			if (open > close) {
				inFunctionBody = true;
				bodyBraceDepth = open - close;
			}

			continue;
		}

		if (
			/^(export\s+)?interface\s+/.test(trimmed) ||
			/^(export\s+)?type\s+\w+.*=\s*{/.test(trimmed) ||
			/^(export\s+)?enum\s+/.test(trimmed)
		) {
			output.push(line);
			const { open, close } = countBracesOnLine(line);
			if (open > close) {
				inKeepBlock = true;
				keepBraceDepth = open - close;
			}

			continue;
		}

		if (
			isKeepableDeclaration(trimmed) ||
			isImportOrExport(trimmed) ||
			isDocComment(trimmed)
		) {
			output.push(line);

			continue;
		}

		if (isConstOrVar(trimmed)) {
			output.push(line);
			const { open, close } = countBracesOnLine(line);
			if (open > close && /^.*=>\s*{/.test(trimmed)) {
				inFunctionBody = true;
				bodyBraceDepth = open - close;
			}

			continue;
		}

		if (isDecoratorOrAnnotation(trimmed)) {
			output.push(line);

			continue;
		}

		if (trimmed === "" && output.length > 0 && output.at(-1) !== "")
			output.push(line);
	}

	if (inFunctionBody) {
		hadBodyOmission = true;
		output.push(BODY_OMISSION_MARKER);
	}

	return { text: output.join("\n"), hadBodyOmission };
}

function extractPythonSignatures(content: string): SignatureResult {
	const lines = content.split("\n");
	const output: string[] = [];
	let hadBodyOmission = false;

	let inFunctionBody = false;
	let bodyIndent = 0;
	let inDocstring = false;
	let docstringDelimiter: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		const indent = line.length - line.trimStart().length;

		if (inDocstring) {
			output.push(line);
			if (trimmed.endsWith(docstringDelimiter ?? '"""')) {
				inDocstring = false;
				docstringDelimiter = null;
			}

			continue;
		}

		if (inFunctionBody) {
			if (trimmed === "" || indent > bodyIndent) continue;
			inFunctionBody = false;
		}

		if (!inFunctionBody) {
			if (/^(async\s+)?def\s+/.test(trimmed)) {
				output.push(line);
				if (indent === 0 || !trimmed.endsWith(":")) {
					inFunctionBody = true;
					bodyIndent = indent;
					hadBodyOmission = true;
					output.push(BODY_OMISSION_MARKER);
				} else {
					inFunctionBody = true;
					bodyIndent = indent;
					hadBodyOmission = true;
					output.push(BODY_OMISSION_MARKER);
				}

				continue;
			}

			if (/^class\s+/.test(trimmed)) {
				output.push(line);
				inFunctionBody = true;
				bodyIndent = indent;

				continue;
			}

			if (
				/^(from\s+\S+\s+)?import\s+/.test(trimmed) ||
				trimmed.startsWith("@") ||
				trimmed.startsWith("#")
			) {
				output.push(line);

				continue;
			}

			if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
				const delimiter = trimmed.slice(0, 3);
				output.push(line);
				if (!trimmed.slice(3).includes(delimiter)) {
					inDocstring = true;
					docstringDelimiter = delimiter;
				}

				continue;
			}

			if (trimmed !== "" && output.length > 0 && output.at(-1) !== "")
				output.push(line);
		}
	}

	return { text: output.join("\n"), hadBodyOmission };
}

function extractGoSignatures(content: string): SignatureResult {
	const lines = content.split("\n");
	const output: string[] = [];
	let hadBodyOmission = false;

	let inFunctionBody = false;
	let bodyBraceDepth = 0;
	const braceState = createScanState();

	for (const line of lines) {
		const trimmed = line.trim();

		if (inFunctionBody) {
			resetScanState(braceState);
			let lineDone = false;
			for (let j = 0; j < line.length && !lineDone; j++) {
				const char = line[j];
				const prevChar = j > 0 ? line[j - 1] : "";
				const result = scanChar(braceState, char, prevChar);
				if (result === "brace-open") bodyBraceDepth++;
				else if (result === "brace-close") {
					bodyBraceDepth--;
					if (bodyBraceDepth <= 0) {
						inFunctionBody = false;
						hadBodyOmission = true;
						output.push(BODY_OMISSION_MARKER);
						lineDone = true;
					}
				}
			}

			continue;
		}

		if (/^func\s+/.test(trimmed)) {
			output.push(line);
			const { open, close } = countBracesOnLine(line);
			if (open > close) {
				inFunctionBody = true;
				bodyBraceDepth = open - close;
			} else if (open === 0 && close === 0 && trimmed.endsWith("{")) {
				inFunctionBody = true;
				bodyBraceDepth = 1;
			}

			continue;
		}

		if (
			/^type\s+/.test(trimmed) ||
			/^import\s+/.test(trimmed) ||
			/^package\s+/.test(trimmed) ||
			/^var\s+/.test(trimmed) ||
			/^const\s+/.test(trimmed) ||
			trimmed.startsWith("//") ||
			trimmed.startsWith("/*")
		) {
			output.push(line);

			continue;
		}

		if (trimmed === "" && output.length > 0 && output.at(-1) !== "")
			output.push(line);
	}

	if (inFunctionBody) {
		hadBodyOmission = true;
		output.push(BODY_OMISSION_MARKER);
	}

	return { text: output.join("\n"), hadBodyOmission };
}

function extractRustSignatures(content: string): SignatureResult {
	const lines = content.split("\n");
	const output: string[] = [];
	let hadBodyOmission = false;

	let inFunctionBody = false;
	let bodyBraceDepth = 0;
	const braceState = createScanState();

	for (const line of lines) {
		const trimmed = line.trim();

		if (inFunctionBody) {
			resetScanState(braceState);
			let lineDone = false;
			for (let j = 0; j < line.length && !lineDone; j++) {
				const char = line[j];
				const prevChar = j > 0 ? line[j - 1] : "";
				const result = scanChar(braceState, char, prevChar);
				if (result === "brace-open") bodyBraceDepth++;
				else if (result === "brace-close") {
					bodyBraceDepth--;
					if (bodyBraceDepth <= 0) {
						inFunctionBody = false;
						hadBodyOmission = true;
						output.push(BODY_OMISSION_MARKER);
						lineDone = true;
					}
				}
			}

			continue;
		}

		if (/^(pub\s+)?(async\s+)?fn\s+/.test(trimmed)) {
			output.push(line);
			const { open, close } = countBracesOnLine(line);
			if (open > close) {
				inFunctionBody = true;
				bodyBraceDepth = open - close;
			}

			continue;
		}

		if (
			/^(pub\s+)?struct\s+/.test(trimmed) ||
			/^(pub\s+)?enum\s+/.test(trimmed) ||
			/^(pub\s+)?trait\s+/.test(trimmed) ||
			/^(pub\s+)?type\s+/.test(trimmed) ||
			/^(pub\s+)?const\s+/.test(trimmed) ||
			/^(pub\s+)?static\s+/.test(trimmed) ||
			/^impl\s+/.test(trimmed) ||
			/^use\s+/.test(trimmed) ||
			/^(pub\s+)?mod\s+/.test(trimmed) ||
			trimmed.startsWith("//") ||
			trimmed.startsWith("/*")
		) {
			output.push(line);

			continue;
		}

		if (trimmed === "" && output.length > 0 && output.at(-1) !== "")
			output.push(line);
	}

	if (inFunctionBody) {
		hadBodyOmission = true;
		output.push(BODY_OMISSION_MARKER);
	}

	return { text: output.join("\n"), hadBodyOmission };
}

function extractJavaSignatures(content: string): SignatureResult {
	const lines = content.split("\n");
	const output: string[] = [];
	let hadBodyOmission = false;

	let inFunctionBody = false;
	let bodyBraceDepth = 0;
	const braceState = createScanState();

	for (const line of lines) {
		const trimmed = line.trim();

		if (inFunctionBody) {
			resetScanState(braceState);
			let lineDone = false;
			for (let j = 0; j < line.length && !lineDone; j++) {
				const char = line[j];
				const prevChar = j > 0 ? line[j - 1] : "";
				const result = scanChar(braceState, char, prevChar);
				if (result === "brace-open") bodyBraceDepth++;
				else if (result === "brace-close") {
					bodyBraceDepth--;
					if (bodyBraceDepth <= 0) {
						inFunctionBody = false;
						hadBodyOmission = true;
						output.push(BODY_OMISSION_MARKER);
						lineDone = true;
					}
				}
			}

			continue;
		}

		if (
			/(public|private|protected|static|final|abstract|synchronized|native)\s+.*\(.*\)/.test(
				trimmed,
			)
		) {
			output.push(line);
			const { open, close } = countBracesOnLine(line);
			if (open > close) {
				inFunctionBody = true;
				bodyBraceDepth = open - close;
			}

			continue;
		}

		if (
			/^class\s+/.test(trimmed) ||
			/^interface\s+/.test(trimmed) ||
			/^enum\s+/.test(trimmed) ||
			/^@interface\s+/.test(trimmed) ||
			/^import\s+/.test(trimmed) ||
			/^package\s+/.test(trimmed) ||
			trimmed.startsWith("@") ||
			trimmed.startsWith("//") ||
			trimmed.startsWith("/*")
		) {
			output.push(line);

			continue;
		}

		if (trimmed === "" && output.length > 0 && output.at(-1) !== "")
			output.push(line);
	}

	if (inFunctionBody) {
		hadBodyOmission = true;
		output.push(BODY_OMISSION_MARKER);
	}

	return { text: output.join("\n"), hadBodyOmission };
}

function extractSignaturesGeneric(content: string): SignatureResult {
	return { text: content, hadBodyOmission: false };
}

const extractors: Record<string, SignatureExtractor> = {
	ts: extractJsLikeSignatures,
	tsx: extractJsLikeSignatures,
	js: extractJsLikeSignatures,
	jsx: extractJsLikeSignatures,
	mjs: extractJsLikeSignatures,
	cjs: extractJsLikeSignatures,
	mts: extractJsLikeSignatures,
	cts: extractJsLikeSignatures,
	py: extractPythonSignatures,
	pyi: extractPythonSignatures,
	go: extractGoSignatures,
	rs: extractRustSignatures,
	java: extractJavaSignatures,
};

export function getSupportedSignatureExtensions(): string[] {
	return Object.keys(extractors);
}

export function extractSignatures(
	content: string,
	fileName: string,
): SignatureResult {
	const ext = fileName.includes(".")
		? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
		: "";
	const extractor = extractors[ext];
	if (!extractor) return extractSignaturesGeneric(content);

	return extractor(content);
}

export function isSignatureExtractionSupported(fileName: string): boolean {
	const ext = fileName.includes(".")
		? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
		: "";

	return ext in extractors;
}
