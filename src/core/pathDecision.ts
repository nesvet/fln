import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import ignore from "ignore";
import type { Logger } from "../infra/index.js";
import { toIgnoreSafePath, toPosixPath } from "../path/index.js";
import {
	normalizeIncludePattern,
	splitExcludePatterns,
} from "../pattern/index.js";
import { analyzeTextFileHeader } from "./fileContent.js";
import { IgnoreMatcher } from "./ignoreMatcher.js";
import {
	getSecurityHeaderBytes,
	getSecurityPatterns,
	isSecuritySensitivePath,
	type SecurityCheckMode,
} from "./securityMatcher.js";

export type PathDecisionReason =
	| "defaultIgnore"
	| "excludePattern"
	| "forceInclude"
	| "gitignore"
	| "hidden"
	| "included"
	| "notFound"
	| "onlyWhitelist"
	| "security"
	| "tooLarge";

export type PathDecision = {
	relativePath: string;
	included: boolean;
	reason: PathDecisionReason;
	detail?: string;
};

export type ExplainPathOptions = {
	input: string;
	relativePath: string;
	exclude: string[];
	include: string[];
	only: string[];
	onlyMode: boolean;
	includeHidden: boolean;
	gitignore: boolean;
	maxFileSize: number;
	securityPatterns: string[];
	securityCheck?: SecurityCheckMode;
};

async function readSecurityDetailFromHeader(
	absolutePath: string,
	securityCheck: SecurityCheckMode = "default",
): Promise<string | undefined> {
	try {
		const fileStat = await stat(absolutePath);
		if (!fileStat.isFile() || fileStat.size === 0) return undefined;

		const headerBytes = getSecurityHeaderBytes(securityCheck);
		const handle = await open(absolutePath, "r");
		try {
			const buffer = Buffer.alloc(Math.min(headerBytes, fileStat.size));
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
			const result = analyzeTextFileHeader(buffer, bytesRead, {
				strict: securityCheck === "strict",
			});

			return result.secretDetail;
		} finally {
			await handle.close();
		}
	} catch {
		return undefined;
	}
}

function pathMatchesMatcher(safePath: string, patterns: string[]): boolean {
	if (patterns.length === 0) return false;

	const matcher = ignore().add(patterns);

	return matcher.ignores(safePath);
}

export async function explainPath(
	options: ExplainPathOptions,
	logger?: Logger,
): Promise<PathDecision> {
	const relativePath = toPosixPath(
		options.relativePath.replaceAll("\\", "/"),
	).replace(/^\/+/, "");
	const absolutePath = join(options.input, relativePath);
	const safePath = toIgnoreSafePath(relativePath, options.input);

	if (safePath === null)
		return {
			relativePath,
			included: false,
			reason: "notFound",
			detail: "Path resolves outside input directory",
		};

	try {
		await stat(absolutePath);
	} catch {
		return { relativePath, included: false, reason: "notFound" };
	}

	const normalizedForce = options.include
		.map((pattern) => normalizeIncludePattern(pattern, options.input))
		.filter((p): p is string => p !== null);
	const normalizedOnly = options.only
		.map((pattern) => normalizeIncludePattern(pattern, options.input))
		.filter((p): p is string => p !== null);

	const isForceIncluded = pathMatchesMatcher(safePath, normalizedForce);

	if (isForceIncluded) {
		const securityCheck = options.securityCheck ?? "default";
		if (
			isSecuritySensitivePath(
				relativePath,
				getSecurityPatterns(options.securityPatterns, securityCheck),
			)
		) {
			const headerDetail = await readSecurityDetailFromHeader(
				absolutePath,
				securityCheck,
			);

			return {
				relativePath,
				included: true,
				reason: "security",
				detail:
					headerDetail ??
					"In tree when force-included; content omitted (security)",
			};
		}

		return { relativePath, included: true, reason: "forceInclude" };
	}

	if (
		options.onlyMode &&
		normalizedOnly.length > 0 &&
		!pathMatchesMatcher(safePath, normalizedOnly)
	)
		return { relativePath, included: false, reason: "onlyWhitelist" };

	const matcher = new IgnoreMatcher({
		input: options.input,
		exclude: options.exclude,
		gitignore: options.gitignore,
		logger,
	});

	if (options.gitignore) {
		const segments = relativePath
			.split("/")
			.filter((segment) => segment !== "");
		let directoryPath = options.input;
		await matcher.addGitignoreForDirectory(directoryPath);
		for (let index = 0; index < segments.length - 1; index++) {
			directoryPath = join(directoryPath, segments[index]);
			await matcher.addGitignoreForDirectory(directoryPath);
		}
	}

	if (matcher.ignoresSafePath(safePath)) {
		const { positive, unignore } = splitExcludePatterns(
			options.exclude,
			options.input,
		);
		if (unignore.length > 0 && pathMatchesMatcher(safePath, unignore))
			return {
				relativePath,
				included: true,
				reason: "included",
				detail: "Un-ignored via exclude negation (!pattern)",
			};

		if (positive.length > 0 && pathMatchesMatcher(safePath, positive))
			return { relativePath, included: false, reason: "excludePattern" };

		return {
			relativePath,
			included: false,
			reason: "defaultIgnore",
			detail: "Built-in ignore, .gitignore, or exclude",
		};
	}

	const baseName = relativePath.split("/").pop() ?? relativePath;
	if (!options.includeHidden && baseName.startsWith(".") && baseName !== ".")
		return { relativePath, included: false, reason: "hidden" };

	if (
		isSecuritySensitivePath(
			relativePath,
			getSecurityPatterns(
				options.securityPatterns,
				options.securityCheck ?? "default",
			),
		)
	) {
		const headerDetail = await readSecurityDetailFromHeader(
			absolutePath,
			options.securityCheck,
		);

		return {
			relativePath,
			included: true,
			reason: "security",
			detail:
				headerDetail ??
				"Listed in tree with skipReason security; content omitted",
		};
	}

	try {
		const fileStat = await stat(absolutePath);
		if (fileStat.isFile()) {
			const headerDetail = await readSecurityDetailFromHeader(
				absolutePath,
				options.securityCheck,
			);
			if (headerDetail)
				return {
					relativePath,
					included: true,
					reason: "security",
					detail: headerDetail,
				};
		}

		if (fileStat.isFile() && fileStat.size > options.maxFileSize)
			return { relativePath, included: false, reason: "tooLarge" };
	} catch {
		return { relativePath, included: false, reason: "notFound" };
	}

	return { relativePath, included: true, reason: "included" };
}

export function formatPathDecision(decision: PathDecision): string {
	const status = decision.included ? "included" : "excluded";
	const detail = decision.detail ? ` (${decision.detail})` : "";

	return `${decision.relativePath}: ${status} — ${decision.reason}${detail}`;
}
