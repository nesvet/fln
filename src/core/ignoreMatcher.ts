import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ignore from "ignore";
import type { Logger } from "../infra/index.js";


type IgnoreMatcherOptions = {
	rootDirectory: string;
	excludePatterns: string[];
	useGitignore: boolean;
	logger?: Logger;
};

const defaultIgnorePatterns = [
	".fln.json",
	".git",
	".DS_Store",
	"Thumbs.db",
	"node_modules",
	".env",
	"package-lock.json",
	"bun.lock",
	"yarn.lock",
	"pnpm-lock.yaml"
];

function normalizeRelativePath(relativePath: string): string {
	const normalized = relativePath.split(sep).join("/");
	
	if (normalized.startsWith("./"))
		return normalized.slice(2);
	
	return normalized;
}

function convertGitignorePattern(pattern: string, relativeDirectory: string): string | undefined {
	const trimmed = pattern.trim();
	if (trimmed === "" || trimmed.startsWith("#"))
		return undefined;
	
	const isEscaped = trimmed.startsWith("\\") && (trimmed[1] === "!" || trimmed[1] === "#");
	const rawPattern = isEscaped ? trimmed.slice(1) : trimmed;
	const isNegated = !isEscaped && rawPattern.startsWith("!");
	const patternBody = isNegated ? rawPattern.slice(1) : rawPattern;
	const normalizedDirectory = normalizeRelativePath(relativeDirectory);
	const prefix = normalizedDirectory === "" ? "" : `${normalizedDirectory}/`;
	
	if (patternBody === "")
		return undefined;
	
	const trimmedTrailingSlash = patternBody.endsWith("/") ? patternBody.slice(0, -1) : patternBody;
	const hasSlash = trimmedTrailingSlash.includes("/");
	let convertedPattern: string;
	
	if (patternBody.startsWith("/"))
		convertedPattern = `${prefix}${patternBody.slice(1)}`;
	else if (hasSlash)
		convertedPattern = `${prefix}${patternBody}`;
	else
		convertedPattern = `${prefix}**/${patternBody}`;
	
	return isNegated ? `!${convertedPattern}` : convertedPattern;
}

function normalizeExcludePattern(pattern: string): string {
	const normalized = pattern.trim();
	const isNegated = normalized.startsWith("!");
	const body = isNegated ? normalized.slice(1) : normalized;
	const trimmedTrailingSlash = body.endsWith("/") ? body.slice(0, -1) : body;
	
	if (body.startsWith("/"))
		return isNegated ? `!${body.slice(1)}` : body.slice(1);
	
	const result = trimmedTrailingSlash.includes("/") ? body : `**/${body}`;
	
	return isNegated ? `!${result}` : result;
}

export class IgnoreMatcher {
	#rootDirectory: string;
	#useGitignore: boolean;
	#logger?: Logger;
	#processedGitignore = new Set<string>();
	#matcher = ignore();
	
	constructor(options: IgnoreMatcherOptions) {
		this.#rootDirectory = options.rootDirectory;
		this.#useGitignore = options.useGitignore;
		this.#logger = options.logger;
		
		this.#matcher.add(defaultIgnorePatterns.map(pattern => normalizeExcludePattern(pattern)));
		this.#matcher.add(options.excludePatterns.map(pattern => normalizeExcludePattern(pattern)));
	}
	
	public ignores(relativePath: string): boolean {
		const normalized = normalizeRelativePath(relativePath);
		
		return normalized !== "" && this.#matcher.ignores(normalized);
	}
	
	public async addGitignoreForDirectory(directoryPath: string): Promise<void> {
		if (!this.#useGitignore)
			return;
		
		if (this.#processedGitignore.has(directoryPath))
			return;
		
		this.#processedGitignore.add(directoryPath);
		
		const gitignorePath = join(directoryPath, ".gitignore");
		const relativeDirectory = relative(this.#rootDirectory, directoryPath);
		
		try {
			await access(gitignorePath, constants.F_OK);
		} catch {
			return;
		}
		
		const content = await readFile(gitignorePath, "utf8");
		const patterns = content
			.split("\n")
			.map(line => convertGitignorePattern(line, relativeDirectory))
			.filter((line): line is string => line !== undefined);
		
		if (patterns.length > 0) {
			this.#matcher.add(patterns);
			this.#logger?.debug(`Loaded ${patterns.length} patterns from ${normalizeRelativePath(relativeDirectory) || "."}/.gitignore`);
		}
	}
}
