import { sortFileNodesByPriority } from "../core/filePriority.js";
import { resolveRelevantFiles } from "../core/relevantGraph.js";
import { isSignatureExtractionSupported } from "../core/signatures.js";
import type { FileNode } from "../core/types.js";
import { estimateTokensFromBytes, formatDateTime } from "../infra/index.js";
import { displayInputPath } from "../path/index.js";
import { type RunFlnPipelineInternal, runFlnPipeline } from "./pipeline.js";

export type Fidelity = "compressed" | "full" | "omit" | "outline";

export type FlnPlanFile = {
	path: string;
	fidelity: Fidelity;
	estimatedTokens: number;
	reason: string;
};

export type FlnPlanOmitted = {
	path: string;
	reason: string;
	savedTokens: number;
};

export type FlnPlan = {
	schemaVersion: 1;
	input: string;
	budget: number;
	projectedTokens: number;
	files: FlnPlanFile[];
	omitted: FlnPlanOmitted[];
	generated: string;
};

export type FlnPlanOptions = {
	input?: string;
	budget?: number;
	relevant?: string[];
	stdinPaths?: string[];
	exclude?: string[];
	include?: string[];
	only?: string[];
	ext?: string;
	since?: string;
	format?: "json" | "md";
	onProgress?: (current: number, total: number) => void;
	logLevel?: "debug" | "normal" | "silent" | "verbose";
};

function collectFileNodes(node: FileNode, result: FileNode[] = []): FileNode[] {
	if (node.type === "file" && !node.skipReason) result.push(node);
	for (const child of node.children ?? []) collectFileNodes(child, result);

	return result;
}

function estimateFileTokens(node: FileNode): number {
	if (node.isBinary) return Math.ceil(node.size / 4);

	return estimateTokensFromBytes(node.size, "estimate");
}

function isLowPriorityDir(filePath: string): boolean {
	const segments = filePath
		.replaceAll("\\", "/")
		.toLowerCase()
		.split("/")
		.filter(Boolean);

	return segments
		.slice(0, -1)
		.some(
			(segment) =>
				segment === "tests" ||
				segment === "test" ||
				segment === "__tests__" ||
				segment === "fixtures" ||
				segment === "mocks" ||
				segment === "e2e",
		);
}

function getFileFidelityReason(
	name: string,
	path: string,
	isSeed: boolean,
): { fidelity: Fidelity; reason: string } {
	const lowerName = name.toLowerCase();
	const inTestDir = isLowPriorityDir(path);

	if (isSeed) return { fidelity: "full", reason: "seed file" };

	if (lowerName.startsWith("readme"))
		return { fidelity: "full", reason: "README — high priority" };

	if (
		lowerName === "package.json" ||
		lowerName.startsWith("tsconfig") ||
		lowerName === "pyproject.toml" ||
		lowerName === "cargo.toml" ||
		lowerName === "go.mod" ||
		lowerName === "cmakelists.txt" ||
		lowerName === "makefile" ||
		lowerName === "dockerfile" ||
		lowerName === "vcpkg.json" ||
		lowerName === "pom.xml"
	)
		return { fidelity: "full", reason: "config manifest — high priority" };

	if (
		!inTestDir &&
		(lowerName.startsWith("index.") ||
			lowerName.startsWith("main.") ||
			lowerName.startsWith("app.") ||
			lowerName.startsWith("server.") ||
			lowerName.startsWith("mod.") ||
			lowerName.startsWith("lib."))
	)
		return { fidelity: "full", reason: "entry point — high priority" };

	if (
		lowerName.includes(".test.") ||
		lowerName.includes(".spec.") ||
		lowerName.startsWith("test_") ||
		lowerName.endsWith("_test.go") ||
		inTestDir
	)
		return { fidelity: "compressed", reason: "test file — deprioritized" };

	if (
		lowerName.startsWith("license") ||
		lowerName.startsWith("changelog") ||
		lowerName.startsWith("contributing") ||
		lowerName.startsWith("code_of_conduct") ||
		lowerName.startsWith("security")
	)
		return { fidelity: "omit", reason: "boilerplate — low value for context" };

	if (isSignatureExtractionSupported(name))
		return { fidelity: "full", reason: "source file" };

	return { fidelity: "full", reason: "source file" };
}

function applyBudget(
	files: Array<{
		node: FileNode;
		fidelity: Fidelity;
		reason: string;
		estimatedTokens: number;
	}>,
	budget: number,
): {
	included: FlnPlanFile[];
	omitted: FlnPlanOmitted[];
	projectedTokens: number;
} {
	const included: FlnPlanFile[] = [];
	const omitted: FlnPlanOmitted[] = [];
	let projectedTokens = 0;

	for (const entry of files) {
		const { node, fidelity, reason, estimatedTokens } = entry;

		if (fidelity === "omit") {
			omitted.push({
				path: node.path,
				reason,
				savedTokens: estimatedTokens,
			});

			continue;
		}

		const tokenCost =
			fidelity === "compressed"
				? Math.ceil(estimatedTokens * 0.3)
				: fidelity === "outline"
					? Math.ceil(estimatedTokens * 0.15)
					: estimatedTokens;

		if (budget > 0 && projectedTokens + tokenCost > budget) {
			if (fidelity === "full" && isSignatureExtractionSupported(node.name)) {
				const compressedCost = Math.ceil(estimatedTokens * 0.3);
				if (projectedTokens + compressedCost <= budget) {
					included.push({
						path: node.path,
						fidelity: "compressed",
						estimatedTokens: compressedCost,
						reason: `${reason} — demoted to compressed (budget)`,
					});
					projectedTokens += compressedCost;

					continue;
				}
			}

			omitted.push({
				path: node.path,
				reason: `budget exceeded — ${reason}`,
				savedTokens: tokenCost,
			});

			continue;
		}

		included.push({
			path: node.path,
			fidelity,
			estimatedTokens: tokenCost,
			reason,
		});
		projectedTokens += tokenCost;
	}

	return { included, omitted, projectedTokens };
}

export async function plan(options: FlnPlanOptions = {}): Promise<FlnPlan> {
	const budget = options.budget ?? 0;

	const pipeline = await runFlnPipeline(
		{
			input: options.input,
			exclude: options.exclude,
			include: options.include,
			only: options.only,
			relevant: options.relevant,
			stdinPaths: options.stdinPaths,
			since: options.since,
			dryRun: true,
			logLevel: options.logLevel ?? "silent",
		},
		{ allowNoFilesIncluded: true } as RunFlnPipelineInternal,
	);

	let { root } = pipeline.scan;

	if (options.relevant && options.relevant.length > 0) {
		const { root: prunedRoot } = await resolveRelevantFiles(
			root,
			pipeline.config.input,
			options.relevant,
		);
		root = prunedRoot;
	}

	const allFiles = collectFileNodes(root);
	sortFileNodesByPriority(allFiles);

	const seedSet = new Set(
		(options.relevant ?? []).map((s) =>
			s.replaceAll("\\", "/").replace(/^\.\//, ""),
		),
	);

	const fileEntries = allFiles.map((node) => {
		const isSeed = seedSet.has(node.path);
		const { fidelity, reason } = getFileFidelityReason(
			node.name,
			node.path,
			isSeed,
		);
		const estimatedTokens = estimateFileTokens(node);

		return { node, fidelity, reason, estimatedTokens };
	});

	const { included, omitted, projectedTokens } = applyBudget(
		fileEntries,
		budget,
	);

	return {
		schemaVersion: 1,
		input: pipeline.config.input,
		budget,
		projectedTokens,
		files: included,
		omitted,
		generated: formatDateTime(),
	};
}

export function formatPlanText(planResult: FlnPlan): string {
	const lines: string[] = [];
	lines.push(
		`# Context Plan: ${displayInputPath(planResult.input)}`,
		"",
		`Budget: ${planResult.budget > 0 ? planResult.budget.toLocaleString() : "unlimited"} tokens`,
		`Projected: ${planResult.projectedTokens.toLocaleString()} tokens`,
		`Files included: ${planResult.files.length}`,
		`Files omitted: ${planResult.omitted.length}`,
		"",
	);

	if (planResult.files.length > 0) {
		lines.push("## Included files", "");
		for (const file of planResult.files) {
			const fidelityLabel =
				file.fidelity === "full" ? "  " : `[${file.fidelity.slice(0, 4)}] `;
			lines.push(
				`${fidelityLabel}${file.path} — ~${file.estimatedTokens.toLocaleString()} tokens (${file.reason})`,
			);
		}
		lines.push("");
	}

	if (planResult.omitted.length > 0) {
		lines.push("## Omitted files", "");
		for (const omitted of planResult.omitted)
			lines.push(
				`  ${omitted.path} — ~${omitted.savedTokens.toLocaleString()} tokens saved (${omitted.reason})`,
			);

		lines.push("");
	}

	return lines.join("\n");
}

export type FlnPlanJson = FlnPlan & { $schema: string };

export function toFlnPlanJson(planResult: FlnPlan): FlnPlanJson {
	return { ...planResult, $schema: "https://fln.nesvet.dev/schema/plan" };
}
