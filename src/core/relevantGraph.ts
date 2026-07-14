import { open } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { decodeBuffer } from "./fileContent.js";
import type { FileNode } from "./types.js";

const importSampleBytes = 8192;

const jsImportPatterns: RegExp[] = [
	/^\s*import\s+(?:type\s+)?(?:[\s\w*,{}]+from\s+)?["']([^"']+)["']/gm,
	/^\s*export\s+(?:type\s+)?(?:[\s\w*,{}]+from\s+)?["']([^"']+)["']/gm,
	/\brequire\s*\(\s*["']([^"']+)["']\s*\)/gm,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gm,
];

const pyImportPatterns: RegExp[] = [
	/^\s*from\s+([\w.]+)\s+import/gm,
	/^\s*import\s+([\w.]+)/gm,
];

const goImportPatterns: RegExp[] = [
	/^\s*import\s+(?:\(\s*([\S\s]*?)\s*\)|["']([^"']+)["'])/gm,
];

const rustImportPatterns: RegExp[] = [
	/^\s*use\s+([^;]+);/gm,
	/^\s*mod\s+(\w+)/gm,
];

const javaImportPatterns: RegExp[] = [/^\s*import\s+([\w.]+);/gm];

const cIncludePatterns: RegExp[] = [/^\s*#\s*include\s*["<]([^">]+)[">]/gm];

type ImportPatternEntry = {
	patterns: RegExp[];
	transform: (match: string, groups: string[]) => string[];
};

const importExtractors: Record<string, ImportPatternEntry> = {
	ts: { patterns: jsImportPatterns, transform: (_m, g) => g },
	tsx: { patterns: jsImportPatterns, transform: (_m, g) => g },
	js: { patterns: jsImportPatterns, transform: (_m, g) => g },
	jsx: { patterns: jsImportPatterns, transform: (_m, g) => g },
	mjs: { patterns: jsImportPatterns, transform: (_m, g) => g },
	cjs: { patterns: jsImportPatterns, transform: (_m, g) => g },
	mts: { patterns: jsImportPatterns, transform: (_m, g) => g },
	cts: { patterns: jsImportPatterns, transform: (_m, g) => g },
	py: {
		patterns: pyImportPatterns,
		transform: (match, _g) => {
			if (match.startsWith("from "))
				return [
					match
						.replace(/^\s*from\s+/, "")
						.replace(/\s+import.*$/, "")
						.trim(),
				];

			return [match.replace(/^\s*import\s+/, "").trim()];
		},
	},
	go: {
		patterns: goImportPatterns,
		transform: (_match, groups) => {
			const [blockContent] = groups;
			if (blockContent)
				return [...blockContent.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

			return groups.slice(1).filter(Boolean);
		},
	},
	rs: {
		patterns: rustImportPatterns,
		transform: (match, _g) => {
			const cleaned = match
				.replace(/^\s*(use|mod)\s+/, "")
				.replace(/;$/, "")
				.trim();

			return [cleaned];
		},
	},
	java: {
		patterns: javaImportPatterns,
		transform: (_match, groups) => groups,
	},
	c: { patterns: cIncludePatterns, transform: (_m, g) => g },
	h: { patterns: cIncludePatterns, transform: (_m, g) => g },
	cpp: { patterns: cIncludePatterns, transform: (_m, g) => g },
	hpp: { patterns: cIncludePatterns, transform: (_m, g) => g },
	cc: { patterns: cIncludePatterns, transform: (_m, g) => g },
};

function getExtractor(fileName: string): ImportPatternEntry | undefined {
	const ext = extname(fileName).slice(1).toLowerCase();

	return importExtractors[ext];
}

export function parseImports(content: string, fileName: string): string[] {
	const extractor = getExtractor(fileName);
	if (!extractor) return [];

	const imports: string[] = [];
	for (const pattern of extractor.patterns) {
		pattern.lastIndex = 0;
		let match = pattern.exec(content);
		while (match !== null) {
			const groups = match.slice(1);
			const transformed = extractor.transform(match[0], groups);
			imports.push(...transformed);
			match = pattern.exec(content);
		}
	}

	return imports;
}

const supportedExtensions = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".mts",
	".cts",
	".py",
	".go",
	".rs",
	".java",
	".c",
	".h",
	".cpp",
	".hpp",
	".cc",
];

const indexFileNames = [
	"index.ts",
	"index.tsx",
	"index.js",
	"index.jsx",
	"index.mjs",
	"index.cjs",
	"__init__.py",
	"mod.go",
	"lib.rs",
];

function resolveImportPath(
	importPath: string,
	currentFileRelative: string,
	_input: string,
	fileSet: Set<string>,
): string | null {
	if (importPath.startsWith(".") || importPath.startsWith("/")) {
		const currentDir = dirname(currentFileRelative);
		let resolved = normalize(
			importPath.startsWith("/")
				? importPath.slice(1)
				: join(currentDir, importPath),
		);
		resolved = resolved.replaceAll("\\", "/");

		if (fileSet.has(resolved)) return resolved;

		const base = resolved.replace(/\.[cm]?[jt]sx?$/, "");
		for (const ext of supportedExtensions) {
			const withExt = `${base}${ext}`;
			if (fileSet.has(withExt)) return withExt;
		}

		for (const indexName of indexFileNames) {
			const indexPath = `${resolved}/${indexName}`;
			if (fileSet.has(indexPath)) return indexPath;
		}

		return null;
	}

	if (importPath.startsWith("@/")) {
		const resolved = normalize(importPath.slice(2)).replaceAll("\\", "/");
		if (fileSet.has(resolved)) return resolved;
		const base = resolved.replace(/\.[cm]?[jt]sx?$/, "");
		for (const ext of supportedExtensions) {
			const withExt = `${base}${ext}`;
			if (fileSet.has(withExt)) return withExt;
		}
		for (const indexName of indexFileNames) {
			const indexPath = `${resolved}/${indexName}`;
			if (fileSet.has(indexPath)) return indexPath;
		}
	}

	return null;
}

function resolvePythonImport(
	importPath: string,
	currentFileRelative: string,
	_input: string,
	fileSet: Set<string>,
): string | null {
	const parts = importPath.split(".").join("/").replaceAll("\\", "/");

	if (fileSet.has(`${parts}.py`)) return `${parts}.py`;

	if (fileSet.has(`${parts}/__init__.py`)) return `${parts}/__init__.py`;

	const currentDir = dirname(currentFileRelative);
	const relativePath = normalize(join(currentDir, parts)).replaceAll("\\", "/");
	if (fileSet.has(`${relativePath}.py`)) return `${relativePath}.py`;
	if (fileSet.has(`${relativePath}/__init__.py`))
		return `${relativePath}/__init__.py`;

	return null;
}

function resolveGoImport(
	_importPath: string,
	_currentFileRelative: string,
	_input: string,
	_fileSet: Set<string>,
): string | null {
	return null;
}

function resolveRustImport(
	importPath: string,
	_currentFileRelative: string,
	_input: string,
	fileSet: Set<string>,
): string | null {
	if (
		importPath.startsWith("crate::") ||
		importPath.startsWith("self::") ||
		importPath.startsWith("super::")
	) {
		const cleaned = importPath
			.replace(/^(crate::|self::|super::)+/, "")
			.replaceAll("::", "/");
		for (const ext of [".rs"]) {
			const withExt = `${cleaned}${ext}`;
			if (fileSet.has(withExt)) return withExt;
		}
		const indexPath = `${cleaned}/mod.rs`;
		if (fileSet.has(indexPath)) return indexPath;
	}

	return null;
}

function resolveJavaImport(
	importPath: string,
	_currentFileRelative: string,
	_input: string,
	fileSet: Set<string>,
): string | null {
	const path = importPath.replaceAll(".", "/");
	if (fileSet.has(`${path}.java`)) return `${path}.java`;

	return null;
}

function resolveCInclude(
	includePath: string,
	currentFileRelative: string,
	_input: string,
	fileSet: Set<string>,
): string | null {
	const currentDir = dirname(currentFileRelative);
	const relative = normalize(join(currentDir, includePath)).replaceAll(
		"\\",
		"/",
	);
	if (fileSet.has(relative)) return relative;
	if (fileSet.has(includePath)) return includePath;

	return null;
}

function resolveImport(
	importPath: string,
	fileName: string,
	currentFileRelative: string,
	input: string,
	fileSet: Set<string>,
): string | null {
	const ext = extname(fileName).slice(1).toLowerCase();

	if (ext === "py")
		return resolvePythonImport(importPath, currentFileRelative, input, fileSet);
	if (ext === "go")
		return resolveGoImport(importPath, currentFileRelative, input, fileSet);
	if (ext === "rs")
		return resolveRustImport(importPath, currentFileRelative, input, fileSet);
	if (ext === "java")
		return resolveJavaImport(importPath, currentFileRelative, input, fileSet);
	if (
		ext === "c" ||
		ext === "h" ||
		ext === "cpp" ||
		ext === "hpp" ||
		ext === "cc"
	)
		return resolveCInclude(importPath, currentFileRelative, input, fileSet);

	return resolveImportPath(importPath, currentFileRelative, input, fileSet);
}

async function readFileImports(filePath: string): Promise<string> {
	const handle = await open(filePath, "r");
	try {
		const buffer = Buffer.alloc(importSampleBytes);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const { text } = decodeBuffer(buffer.subarray(0, bytesRead), "auto");

		return text;
	} finally {
		await handle.close();
	}
}

function collectFileNodes(node: FileNode, result: FileNode[] = []): FileNode[] {
	if (node.type === "file" && !node.skipReason) result.push(node);
	for (const child of node.children ?? []) collectFileNodes(child, result);

	return result;
}

export function pruneTree(
	node: FileNode,
	relevantSet: Set<string>,
): FileNode | undefined {
	if (node.type === "file")
		return relevantSet.has(node.path) ? node : undefined;

	const prunedChildren: FileNode[] = [];
	for (const child of node.children ?? []) {
		const pruned = pruneTree(child, relevantSet);
		if (pruned) prunedChildren.push(pruned);
	}

	if (prunedChildren.length === 0) return undefined;

	return { ...node, children: prunedChildren };
}

export async function resolveRelevantFiles(
	root: FileNode,
	input: string,
	seeds: string[],
	maxDepth = 20,
): Promise<{ root: FileNode; relevantSet: Set<string> }> {
	const allFiles = collectFileNodes(root);
	const fileSet = new Set(allFiles.map((f) => f.path));

	const normalizedSeeds = seeds
		.map((s) => s.replaceAll("\\", "/").replace(/^\.\//, ""))
		.filter((s) => fileSet.has(s));

	if (normalizedSeeds.length === 0) return { root, relevantSet: fileSet };

	const importGraph = new Map<string, string[]>();
	for (const file of allFiles) {
		if (!getExtractor(file.name)) continue;
		try {
			const content = await readFileImports(join(input, file.path));
			const imports = parseImports(content, file.name);
			const resolved = imports
				.map((imp) => resolveImport(imp, file.name, file.path, input, fileSet))
				.filter((p): p is string => p !== null);
			importGraph.set(file.path, resolved);
		} catch {
			importGraph.set(file.path, []);
		}
	}

	const relevantSet = new Set<string>(normalizedSeeds);
	const queue: Array<{ path: string; depth: number }> = normalizedSeeds.map(
		(path) => ({ path, depth: 0 }),
	);

	while (queue.length > 0) {
		const item = queue.shift();
		if (!item) break;

		const { path, depth } = item;
		if (depth >= maxDepth) continue;

		const imports = importGraph.get(path) ?? [];
		for (const imported of imports)
			if (!relevantSet.has(imported)) {
				relevantSet.add(imported);
				queue.push({ path: imported, depth: depth + 1 });
			}
	}

	const prunedRoot = pruneTree(root, relevantSet) ?? { ...root, children: [] };

	return { root: prunedRoot, relevantSet };
}
