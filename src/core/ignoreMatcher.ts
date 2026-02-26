import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ignore from "ignore";
import {
	stripLeadingDotSlash,
	toDisplayPath,
	toIgnoreSafePath,
	toPosixPath
} from "../path/index.js";
import { normalizeExcludePattern } from "../pattern/index.js";
import type { Logger } from "../infra/index.js";


type IgnoreMatcherOptions = {
	input: string;
	excludePatterns: string[];
	gitignore: boolean;
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

function convertGitignorePattern(pattern: string, relativeDirectory: string): string | undefined {
	const trimmed = pattern.trim();
	if (trimmed === "" || trimmed.startsWith("#"))
		return undefined;
	
	const isEscaped = trimmed.startsWith("\\") && (trimmed[1] === "!" || trimmed[1] === "#");
	const rawPattern = isEscaped ? trimmed.slice(1) : trimmed;
	const isNegated = !isEscaped && rawPattern.startsWith("!");
	const patternBody = isNegated ? rawPattern.slice(1) : rawPattern;
	const normalizedDirectory = stripLeadingDotSlash(toPosixPath(relativeDirectory));
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

export class IgnoreMatcher {
	#input: string;
	#gitignore: boolean;
	#logger?: Logger;
	#processedGitignore = new Set<string>();
	#matcher = ignore();
	
	constructor(options: IgnoreMatcherOptions) {
		this.#input = options.input;
		this.#gitignore = options.gitignore;
		this.#logger = options.logger;
		
		const defaultPatterns = defaultIgnorePatterns
			.map(pattern => normalizeExcludePattern(pattern, this.#input))
			.filter((p): p is string => p !== null);
		this.#matcher.add(defaultPatterns);
		
		const userPatterns = options.excludePatterns
			.map(pattern => normalizeExcludePattern(pattern, this.#input))
			.filter((p): p is string => p !== null);
		this.#matcher.add(userPatterns);
	}
	
	public ignores(relativePath: string): boolean {
		const safe = toIgnoreSafePath(relativePath, this.#input);
		
		return this.ignoresSafePath(safe);
	}
	
	public ignoresSafePath(safePath: string | null): boolean {
		if (safePath === null || safePath === "")
			return false;
		
		return this.#matcher.ignores(safePath);
	}
	
	public async addGitignoreForDirectory(directoryPath: string): Promise<void> {
		if (!this.#gitignore)
			return;
		
		if (this.#processedGitignore.has(directoryPath))
			return;
		
		this.#processedGitignore.add(directoryPath);
		
		const gitignorePath = join(directoryPath, ".gitignore");
		const relativeDirectory = relative(this.#input, directoryPath);
		
		let content: string;
		try {
			content = await readFile(gitignorePath, "utf8");
		} catch (error) {
			if ((error as { code?: string }).code !== "ENOENT")
				this.#logger?.debug(`Failed to read .gitignore at ${gitignorePath}: ${String(error)}`);
			
			return;
		}
		const patterns = content
			.split("\n")
			.map(line => convertGitignorePattern(line, relativeDirectory))
			.filter((line): line is string => line !== undefined);
		
		if (patterns.length > 0) {
			this.#matcher.add(patterns);
			this.#logger?.debug(`Loaded ${patterns.length} patterns from ${toDisplayPath(relativeDirectory, this.#input)}/.gitignore`);
		}
	}
}
