import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { writeOutput } from "../core/index.js";
import { computeUnifiedHunks } from "../core/lineDiff.js";
import {
	countTextTokensCached,
	fileTokenCacheKey,
	flnError,
	formatDateTime,
	type TokenModel,
} from "../infra/index.js";
import { displayInputPath } from "../path/index.js";
import { runFlnPipeline } from "./pipeline.js";

type SnapshotFidelity = "compressed" | "full" | "outline";

const noop = (): void => undefined;

export type FlnDiffFile = {
	path: string;
	status: "added" | "changed" | "removed";
	sizeDelta: number;
	tokenDelta: number;
	fidelityBefore?: SnapshotFidelity;
	fidelityAfter?: SnapshotFidelity;
	hunks?: string[];
};

export type FlnDiff = {
	schemaVersion: 1;
	before: string;
	after: string;
	added: string[];
	removed: string[];
	changed: FlnDiffFile[];
	treeAdded: string[];
	treeRemoved: string[];
	stats: {
		filesAdded: number;
		filesRemoved: number;
		filesChanged: number;
		tokenDelta: number;
		sizeDelta: number;
		treeAdded: number;
		treeRemoved: number;
	};
	generated: string;
};

export type FlnDiffOptions =
	| { before: string; after: string; includeHunks?: boolean }
	| { refs: [string, string]; input: string; includeHunks?: boolean }
	| { since: string; input: string; includeHunks?: boolean };

type ParsedSnapshot = {
	format: "json" | "md";
	tokenModel?: TokenModel;
	paths: Map<
		string,
		{
			size: number;
			tokens: number;
			hash: string;
			fidelity: SnapshotFidelity;
			body: string;
		}
	>;
	treePaths: Set<string>;
};

type JsonTreeNode = { name: string; children?: JsonTreeNode[] };
type JsonSnapshot = {
	files?: Array<{ path: string; content: string | null }>;
	options?: {
		outline?: boolean;
		compress?: boolean;
		tokenModel?: TokenModel;
	};
	root?: JsonTreeNode;
};

const mdHeaderModelPattern =
	/<!-- 🥞 fln [\d.]+(?: · model: (estimate|claude|gemini|gpt-4|gpt-4o|gpt-5))? -->/;

const mdSectionPattern =
	/^### (.*?)(?:\s\((outline|compressed)\))?\n(`{3,})\w*\n([\S\s]*?)\n\3[\t ]*$/gm;
const treeSectionPattern =
	/^## Directory Tree\n(`{3,})text\n([\S\s]*?)\n\1[\t ]*$/m;
const treeLinePattern = /^([ │]*)(?:├── |└── )(.+)$/;

function hashContent(content: string): string {
	return createHash("sha1").update(content, "utf8").digest("hex");
}

function estimateTokensFromSize(size: number): number {
	return Math.ceil(size / 4);
}

async function countSnapshotTokens(
	body: string,
	tokenModel: TokenModel | undefined,
	path?: string,
): Promise<number> {
	const size = Buffer.byteLength(body, "utf8");
	if (!tokenModel) return estimateTokensFromSize(size);

	const cacheKey =
		path !== undefined
			? fileTokenCacheKey(
					`${path}\0${hashContent(body)}`,
					undefined,
					size,
					tokenModel,
				)
			: undefined;

	return countTextTokensCached(body, tokenModel, cacheKey);
}

async function readSnapshotFile(filePath: string): Promise<string> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		throw flnError("READ_FAILED", `Cannot read snapshot file: ${filePath}`, {
			hint: error instanceof Error ? error.message : String(error),
		});
	}
}

function parseTreePaths(treeContent: string): Set<string> {
	const paths = new Set<string>();
	let stack: string[] = [];

	for (const line of treeContent.split("\n")) {
		const match = treeLinePattern.exec(line);
		if (!match) continue;
		const [, indent, rawName] = match;
		const name = rawName.replace(/ → .*$/, "").trim();
		const depth = Math.floor(indent.length / 4);
		stack = stack.slice(0, depth);
		stack[depth] = name;
		paths.add(stack.slice(0, depth + 1).join("/"));
	}

	return paths;
}

function collectTreePathsFromJson(
	node: JsonTreeNode,
	prefix = "",
): Set<string> {
	const paths = new Set<string>();
	for (const child of node.children ?? []) {
		const childPath = prefix ? `${prefix}/${child.name}` : child.name;
		paths.add(childPath);
		for (const sub of collectTreePathsFromJson(child, childPath))
			paths.add(sub);
	}

	return paths;
}

async function parseMarkdownSnapshot(
	filePath: string,
): Promise<ParsedSnapshot> {
	const content = await readSnapshotFile(filePath);
	const headerMatch = mdHeaderModelPattern.exec(content);
	const tokenModel = headerMatch?.[1] as TokenModel | undefined;
	const paths = new Map<
		string,
		{
			size: number;
			tokens: number;
			hash: string;
			fidelity: SnapshotFidelity;
			body: string;
		}
	>();

	let match = mdSectionPattern.exec(content);
	while (match !== null) {
		const [, rawPath, fidelityLabel, , body] = match;
		const size = Buffer.byteLength(body, "utf8");
		const fidelity: SnapshotFidelity =
			(fidelityLabel as SnapshotFidelity | undefined) ?? "full";
		paths.set(rawPath.trim(), {
			size,
			tokens: await countSnapshotTokens(body, tokenModel, rawPath.trim()),
			hash: hashContent(body),
			fidelity,
			body,
		});
		match = mdSectionPattern.exec(content);
	}

	const treeMatch = treeSectionPattern.exec(content);
	const treePaths = treeMatch
		? parseTreePaths(treeMatch[2])
		: new Set<string>();

	return { format: "md", tokenModel, paths, treePaths };
}

async function parseJsonSnapshot(filePath: string): Promise<ParsedSnapshot> {
	const content = await readSnapshotFile(filePath);
	let parsed: JsonSnapshot;
	try {
		parsed = JSON.parse(content) as JsonSnapshot;
	} catch (error) {
		throw flnError(
			"INVALID_CONFIG",
			`Invalid JSON in snapshot file: ${filePath}`,
			{ hint: error instanceof Error ? error.message : String(error) },
		);
	}
	const paths = new Map<
		string,
		{
			size: number;
			tokens: number;
			hash: string;
			fidelity: SnapshotFidelity;
			body: string;
		}
	>();

	const globalFidelity: SnapshotFidelity = parsed.options?.outline
		? "outline"
		: parsed.options?.compress
			? "compressed"
			: "full";
	const tokenModel = parsed.options?.tokenModel;

	for (const file of parsed.files ?? []) {
		const body = file.content ?? "";
		const size = file.content ? Buffer.byteLength(file.content, "utf8") : 0;
		paths.set(file.path, {
			size,
			tokens: await countSnapshotTokens(body, tokenModel, file.path),
			hash: hashContent(body),
			fidelity: globalFidelity,
			body,
		});
	}

	const treePaths = parsed.root
		? collectTreePathsFromJson(parsed.root)
		: new Set<string>();

	return { format: "json", tokenModel, paths, treePaths };
}

async function parseSnapshot(filePath: string): Promise<ParsedSnapshot> {
	const ext = extname(filePath).toLowerCase();
	if (ext === ".json") return parseJsonSnapshot(filePath);

	return parseMarkdownSnapshot(filePath);
}

async function generateSnapshotFile(
	inputDir: string,
	outputPath: string,
): Promise<void> {
	const pipeline = await runFlnPipeline({
		input: inputDir,
		output: outputPath,
		format: "md",
		logLevel: "silent",
	});
	await writeOutput(pipeline.scan, pipeline.config, pipeline.logger);
}

async function extractGitRefToTempDir(
	ref: string,
	cwd: string,
): Promise<string> {
	const tempDir = await mkdtemp(join(tmpdir(), "fln-diff-ref-"));
	const archiveFile = `${tempDir}.tar`;

	const archiveResult = spawnSync(
		"git",
		["archive", "--format=tar", `--output=${archiveFile}`, ref],
		{
			cwd,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	if (archiveResult.error) {
		await rm(tempDir, { recursive: true, force: true }).catch(noop);

		throw flnError(
			"GIT_NOT_FOUND",
			`Git not found (${archiveResult.error.message}).`,
			{ hint: "Install git and ensure it is in PATH." },
		);
	}

	if (archiveResult.status !== 0) {
		const stderr = (archiveResult.stderr ?? "").trim();
		await rm(tempDir, { recursive: true, force: true }).catch(noop);
		await rm(archiveFile, { force: true }).catch(noop);

		throw flnError(
			"GIT_REF_INVALID",
			stderr || `git archive failed for ref: ${ref}`,
		);
	}

	const extractResult = spawnSync("tar", ["-xf", archiveFile, "-C", tempDir], {
		encoding: "utf8",
		stdio: ["pipe", "pipe", "pipe"],
	});

	await rm(archiveFile, { force: true }).catch(noop);

	if (extractResult.error || extractResult.status !== 0) {
		const stderr = (extractResult.stderr ?? "").trim();
		await rm(tempDir, { recursive: true, force: true }).catch(noop);

		throw flnError(
			"GIT_REF_INVALID",
			`Failed to extract git archive: ${extractResult.error?.message ?? stderr ?? "unknown error"}`,
		);
	}

	return tempDir;
}

async function resolveDiffInputs(options: FlnDiffOptions): Promise<{
	beforePath: string;
	afterPath: string;
	beforeLabel: string;
	afterLabel: string;
	tempPaths: string[];
}> {
	if ("before" in options && "after" in options)
		return {
			beforePath: options.before,
			afterPath: options.after,
			beforeLabel: options.before,
			afterLabel: options.after,
			tempPaths: [],
		};

	const input = "input" in options ? options.input : process.cwd();
	const tempPaths: string[] = [];

	const makeSnapshot = async (
		sourceDir: string,
		label: string,
	): Promise<{ path: string; label: string }> => {
		const snapshotDir = await mkdtemp(join(tmpdir(), "fln-diff-snap-"));
		tempPaths.push(snapshotDir);
		const snapshotPath = join(snapshotDir, "snapshot.md");
		await generateSnapshotFile(sourceDir, snapshotPath);

		return { path: snapshotPath, label };
	};

	if ("since" in options) {
		const refDir = await extractGitRefToTempDir(options.since, input);
		tempPaths.push(refDir);
		const before = await makeSnapshot(refDir, options.since);
		const after = await makeSnapshot(input, "working tree");

		return {
			beforePath: before.path,
			afterPath: after.path,
			beforeLabel: before.label,
			afterLabel: after.label,
			tempPaths,
		};
	}

	if ("refs" in options) {
		const refDirA = await extractGitRefToTempDir(options.refs[0], input);
		const refDirB = await extractGitRefToTempDir(options.refs[1], input);
		tempPaths.push(refDirA, refDirB);
		const before = await makeSnapshot(refDirA, options.refs[0]);
		const after = await makeSnapshot(refDirB, options.refs[1]);

		return {
			beforePath: before.path,
			afterPath: after.path,
			beforeLabel: before.label,
			afterLabel: after.label,
			tempPaths,
		};
	}

	throw flnError("INVALID_CONFIG", "Invalid diff options");
}

export async function diff(options: FlnDiffOptions): Promise<FlnDiff> {
	const { beforePath, afterPath, beforeLabel, afterLabel, tempPaths } =
		await resolveDiffInputs(options);

	try {
		const [before, after] = await Promise.all([
			parseSnapshot(beforePath),
			parseSnapshot(afterPath),
		]);

		const beforePaths = new Set(before.paths.keys());
		const afterPaths = new Set(after.paths.keys());

		const added: string[] = [];
		const removed: string[] = [];
		const changed: FlnDiffFile[] = [];

		let totalTokenDelta = 0;
		let totalSizeDelta = 0;

		for (const path of afterPaths) {
			const afterData = after.paths.get(path);
			if (!afterData) continue;

			if (beforePaths.has(path)) {
				const beforeData = before.paths.get(path);
				if (!beforeData) continue;

				if (beforeData.hash !== afterData.hash) {
					const sizeDelta = afterData.size - beforeData.size;
					const tokenDelta = afterData.tokens - beforeData.tokens;
					const changedEntry: FlnDiffFile = {
						path,
						status: "changed",
						sizeDelta,
						tokenDelta,
						fidelityBefore: beforeData.fidelity,
						fidelityAfter: afterData.fidelity,
					};
					if (options.includeHunks) {
						const hunks = computeUnifiedHunks(
							path,
							beforeData.body,
							afterData.body,
						);
						if (hunks.length > 0) changedEntry.hunks = hunks;
					}
					changed.push(changedEntry);
					totalTokenDelta += tokenDelta;
					totalSizeDelta += sizeDelta;
				}
			} else {
				added.push(path);
				totalTokenDelta += afterData.tokens;
				totalSizeDelta += afterData.size;
			}
		}

		for (const path of beforePaths)
			if (!afterPaths.has(path)) {
				removed.push(path);
				const beforeData = before.paths.get(path);
				if (!beforeData) continue;
				totalTokenDelta -= beforeData.tokens;
				totalSizeDelta -= beforeData.size;
			}

		added.sort();
		removed.sort();
		changed.sort((a, b) => a.path.localeCompare(b.path));

		const treeAdded = [...after.treePaths]
			.filter((p) => !before.treePaths.has(p))
			.sort();
		const treeRemoved = [...before.treePaths]
			.filter((p) => !after.treePaths.has(p))
			.sort();

		return {
			schemaVersion: 1,
			before: beforeLabel,
			after: afterLabel,
			added,
			removed,
			changed,
			treeAdded,
			treeRemoved,
			stats: {
				filesAdded: added.length,
				filesRemoved: removed.length,
				filesChanged: changed.length,
				tokenDelta: totalTokenDelta,
				sizeDelta: totalSizeDelta,
				treeAdded: treeAdded.length,
				treeRemoved: treeRemoved.length,
			},
			generated: formatDateTime(),
		};
	} finally {
		await Promise.all(
			tempPaths.map((p) => rm(p, { recursive: true, force: true }).catch(noop)),
		);
	}
}

export function formatDiffText(diffResult: FlnDiff): string {
	const lines: string[] = [];
	const { stats } = diffResult;

	lines.push(
		"# Snapshot Diff",
		"",
		`Before: ${displayInputPath(diffResult.before)}`,
		`After:  ${displayInputPath(diffResult.after)}`,
		"",
		`Files: +${stats.filesAdded} added, -${stats.filesRemoved} removed, ~${stats.filesChanged} changed`,
		`Tree:  +${stats.treeAdded} added, -${stats.treeRemoved} removed`,
		`Tokens: ${stats.tokenDelta >= 0 ? "+" : ""}${stats.tokenDelta.toLocaleString()} delta`,
		`Size:   ${formatSizeDelta(stats.sizeDelta)}`,
		"",
	);

	if (diffResult.treeAdded.length > 0) {
		lines.push("## Tree added", "");
		for (const path of diffResult.treeAdded) lines.push(`  + ${path}`);
		lines.push("");
	}

	if (diffResult.treeRemoved.length > 0) {
		lines.push("## Tree removed", "");
		for (const path of diffResult.treeRemoved) lines.push(`  - ${path}`);
		lines.push("");
	}

	if (diffResult.added.length > 0) {
		lines.push("## Added files", "");
		for (const path of diffResult.added) lines.push(`  + ${path}`);
		lines.push("");
	}

	if (diffResult.removed.length > 0) {
		lines.push("## Removed files", "");
		for (const path of diffResult.removed) lines.push(`  - ${path}`);
		lines.push("");
	}

	if (diffResult.changed.length > 0) {
		lines.push("## Changed files", "");
		for (const file of diffResult.changed) {
			const fidelityTag =
				file.fidelityBefore === file.fidelityAfter
					? ""
					: ` [${file.fidelityBefore ?? "?"}→${file.fidelityAfter ?? "?"}]`;
			lines.push(
				`  ~ ${file.path}${fidelityTag} (${formatSizeDelta(file.sizeDelta)}, ${file.tokenDelta >= 0 ? "+" : ""}${file.tokenDelta.toLocaleString()} tokens)`,
			);
			if (file.hunks)
				for (const hunk of file.hunks) {
					lines.push("");
					lines.push(hunk);
				}
		}
		lines.push("");
	}

	if (
		diffResult.added.length === 0 &&
		diffResult.removed.length === 0 &&
		diffResult.changed.length === 0 &&
		diffResult.treeAdded.length === 0 &&
		diffResult.treeRemoved.length === 0
	)
		lines.push("No changes detected.", "");

	return lines.join("\n");
}

function formatSizeDelta(delta: number): string {
	const sign = delta >= 0 ? "+" : "";
	if (Math.abs(delta) < 1024) return `${sign}${delta} B`;
	if (Math.abs(delta) < 1024 * 1024)
		return `${sign}${(delta / 1024).toFixed(1)} KB`;

	return `${sign}${(delta / (1024 * 1024)).toFixed(1)} MB`;
}

export type FlnDiffJson = FlnDiff & { $schema: string };

export function toFlnDiffJson(diffResult: FlnDiff): FlnDiffJson {
	return { ...diffResult, $schema: "https://fln.nesvet.dev/schema/diff" };
}
