import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListResourcesRequestSchema,
	ListResourceTemplatesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
	type ReadResourceResult,
	type Resource,
	type ResourceTemplate,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { writeOutput } from "../core/index.js";
import { formatPathDecision } from "../core/pathDecision.js";
import { flnError } from "../infra/flnError.js";
import { VERSION } from "../version.js";
import { diff, formatDiffText } from "./diff.js";
import { doctor, formatDoctorText, toFlnDoctorJson } from "./doctor.js";
import { explain, toFlnWhyJson } from "./explain.js";
import {
	finalizeClipboardOutput,
	runFlnPipeline,
	toFlnResult,
} from "./pipeline.js";
import { formatPlanText, plan } from "./plan.js";

export type FlnMcpOptions = {
	/** Default input directory if not specified by tool call */
	defaultInput?: string;
	/** Max output size in bytes for fln_snapshot tool (default: 2 MiB) */
	maxSnapshotBytes?: number;
	/** Start MCP over HTTP instead of stdio */
	http?: boolean;
	/** HTTP listen port when http is true (default: 3000) */
	port?: number;
};

const DEFAULT_MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

const SNAPSHOT_TOOL: Tool = {
	name: "fln_snapshot",
	description:
		"Flatten a codebase directory into a single AI-ready markdown or JSON snapshot. " +
		"Returns the full snapshot content inline. " +
		"Respects .gitignore, skips binaries and security-sensitive files, " +
		"reports token count and file statistics.",
	inputSchema: {
		type: "object" as const,
		properties: {
			input: {
				type: "string",
				description:
					"Directory to flatten (default: server's defaultInput or cwd)",
			},
			format: {
				type: "string",
				enum: ["md", "json"],
				description: "Output format (default: md)",
			},
			exclude: {
				type: "array",
				items: { type: "string" },
				description: "Glob patterns to exclude",
			},
			include: {
				type: "array",
				items: { type: "string" },
				description: "Force-include paths (additive; bypasses ignore + hidden)",
			},
			only: {
				type: "array",
				items: { type: "string" },
				description: "Whitelist: only matching files",
			},
			ext: {
				type: "string",
				description: "Comma-separated extensions to whitelist (e.g. 'ts,tsx')",
			},
			maxTokens: {
				type: "number",
				description: "Max estimated tokens in output (0 = unlimited)",
			},
			compress: {
				type: "boolean",
				description:
					"Signature extraction — imports, types, function signatures (bodies omitted)",
			},
			contents: {
				type: "boolean",
				description: "Include file contents (default: true)",
			},
			tree: {
				type: "boolean",
				description: "Include directory tree (default: true)",
			},
			includeHidden: {
				type: "boolean",
				description: "Include hidden files and directories",
			},
			annotateTree: {
				type: "string",
				enum: ["tokens", "lines", "size"],
				description:
					"Annotate tree with per-file counts; tokens/lines defer tree to end",
			},
			collectTodo: {
				type: "boolean",
				description:
					"Collect TODO/FIXME/HACK/XXX/NOTE/BUG/WARN markers into a dedicated section",
			},
		},
	},
};

const WHY_TOOL: Tool = {
	name: "fln_why",
	description:
		"Explain why a path is included or excluded from the snapshot. " +
		"Use this to understand fln's filtering decisions — why a file was skipped, " +
		"why a security-sensitive path was omitted, or why a gitignored file is absent.",
	inputSchema: {
		type: "object" as const,
		properties: {
			path: {
				type: "string",
				description: "Relative path to explain (e.g. 'src/index.ts', '.env')",
			},
			input: {
				type: "string",
				description:
					"Directory to check against (default: server's defaultInput or cwd)",
			},
			include: {
				type: "array",
				items: { type: "string" },
				description: "Force-include patterns to apply",
			},
			includeHidden: {
				type: "boolean",
				description: "Whether hidden files would be included",
			},
		},
		required: ["path"],
	},
};

const DOCTOR_TOOL: Tool = {
	name: "fln_doctor",
	description:
		"Run preflight diagnostics on a codebase directory. " +
		"Reports config, git status, scan statistics, token estimate, " +
		"extension breakdown, and warnings (oversized files, security paths, token budget). " +
		"Does not write any output file.",
	inputSchema: {
		type: "object" as const,
		properties: {
			input: {
				type: "string",
				description:
					"Directory to check (default: server's defaultInput or cwd)",
			},
			maxTokens: {
				type: "number",
				description: "Token budget to check against for warnings",
			},
			exclude: {
				type: "array",
				items: { type: "string" },
				description: "Glob patterns to exclude",
			},
			include: {
				type: "array",
				items: { type: "string" },
				description: "Force-include paths",
			},
			only: {
				type: "array",
				items: { type: "string" },
				description: "Whitelist: only matching files",
			},
		},
	},
};

const PLAN_TOOL: Tool = {
	name: "fln_plan",
	description:
		"Plan what context to include for a given token budget. " +
		"Analyzes the codebase, assigns fidelity (full/compressed/outline/omit) per file, " +
		"and projects token usage. Use before fln_snapshot to budget context for a specific task. " +
		"Supports --relevant for import-graph-based seed expansion.",
	inputSchema: {
		type: "object" as const,
		properties: {
			input: {
				type: "string",
				description:
					"Directory to plan for (default: server's defaultInput or cwd)",
			},
			budget: {
				type: "number",
				description: "Token budget (0 = unlimited; files ranked by priority)",
			},
			relevant: {
				type: "array",
				items: { type: "string" },
				description:
					"Seed paths — only include files transitively imported by these",
			},
			exclude: {
				type: "array",
				items: { type: "string" },
				description: "Glob patterns to exclude",
			},
			include: {
				type: "array",
				items: { type: "string" },
				description: "Force-include paths",
			},
			only: {
				type: "array",
				items: { type: "string" },
				description: "Whitelist: only matching files",
			},
		},
	},
};

const DIFF_TOOL: Tool = {
	name: "fln_diff",
	description:
		"Diff two fln snapshots to see what changed between them. " +
		"Accepts paths to two snapshot files (markdown or JSON). " +
		"Returns added, removed, changed files with token/size deltas and tree-delta.",
	inputSchema: {
		type: "object" as const,
		properties: {
			before: {
				type: "string",
				description: "Path to the 'before' snapshot file",
			},
			after: {
				type: "string",
				description: "Path to the 'after' snapshot file",
			},
		},
		required: ["before", "after"],
	},
};

export const ALL_TOOLS: Tool[] = [
	SNAPSHOT_TOOL,
	WHY_TOOL,
	DOCTOR_TOOL,
	PLAN_TOOL,
	DIFF_TOOL,
];

export const RESOURCE_TEMPLATES: ResourceTemplate[] = [
	{
		uriTemplate: "fln_file://{path}",
		name: "fln file",
		description: "Read a file from the input directory by relative path",
		mimeType: "text/plain",
	},
	{
		uriTemplate: "fln_snapshot://{name}",
		name: "fln snapshot",
		description: "Generate a fln snapshot of the input directory",
		mimeType: "text/markdown",
	},
];

export type SnapshotArgs = {
	input?: string;
	format?: "json" | "md";
	exclude?: string[];
	include?: string[];
	only?: string[];
	ext?: string;
	maxTokens?: number;
	compress?: boolean;
	contents?: boolean;
	tree?: boolean;
	includeHidden?: boolean;
	annotateTree?: "lines" | "size" | "tokens";
	collectTodo?: boolean;
};

export type WhyArgs = {
	path: string;
	input?: string;
	include?: string[];
	includeHidden?: boolean;
};

export type DoctorArgs = {
	input?: string;
	maxTokens?: number;
	exclude?: string[];
	include?: string[];
	only?: string[];
};

export type PlanArgs = {
	input?: string;
	budget?: number;
	relevant?: string[];
	exclude?: string[];
	include?: string[];
	only?: string[];
};

export type DiffArgs = {
	before: string;
	after: string;
};

function resolveInput(
	argInput: string | undefined,
	defaultInput: string | undefined,
): string {
	return resolve(argInput ?? defaultInput ?? process.cwd());
}

function textResult(text: string): CallToolResult {
	return {
		content: [{ type: "text", text }],
	};
}

function errorResult(message: string): CallToolResult {
	return {
		content: [{ type: "text", text: message }],
		isError: true,
	};
}

function structuredTextResult(
	text: string,
	structured: Record<string, unknown>,
): CallToolResult {
	return {
		content: [{ type: "text", text }],
		structuredContent: structured,
	};
}

export async function handleSnapshot(
	args: SnapshotArgs,
	options: FlnMcpOptions,
): Promise<CallToolResult> {
	const input = resolveInput(args.input, options.defaultInput);
	const maxBytes = options.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
	const format = args.format ?? "md";

	const tempDir = await mkdtemp(join(tmpdir(), "fln-mcp-"));
	const tempFile = join(tempDir, `snapshot.${format}`);

	try {
		const pipeline = await runFlnPipeline({
			input,
			output: tempFile,
			overwrite: true,
			format,
			exclude: args.exclude,
			include: args.include,
			only: args.only,
			maxTokens: args.maxTokens,
			compress: args.compress,
			contents: args.contents,
			tree: args.tree,
			includeHidden: args.includeHidden,
			annotateTree: args.annotateTree,
			collectTodo: args.collectTodo,
			logLevel: "silent",
		});
		await writeOutput(pipeline.scan, pipeline.config, pipeline.logger);
		await finalizeClipboardOutput(pipeline);
		const result = toFlnResult(pipeline.scan, pipeline.outputPath);

		const content = await readFile(tempFile, "utf8");
		const contentBytes = Buffer.byteLength(content);

		if (contentBytes > maxBytes)
			return errorResult(
				`Snapshot is ${contentBytes} bytes — exceeds inline limit of ${maxBytes} bytes. ` +
					"Use fln CLI with -o to write to file, or reduce scope with --only/--ext/--exclude. " +
					`Stats: ${result.filesIncluded} files, ~${result.outputTokenCount.toLocaleString()} tokens.`,
			);

		return textResult(content);
	} catch (error) {
		if (error instanceof Error)
			return errorResult(`fln_snapshot failed: ${error.message}`);

		return errorResult(`fln_snapshot failed: ${String(error)}`);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function handleWhy(
	args: WhyArgs,
	options: FlnMcpOptions,
): Promise<CallToolResult> {
	const input = resolveInput(args.input, options.defaultInput);

	try {
		const decision = await explain({
			path: args.path,
			input,
			include: args.include,
			includeHidden: args.includeHidden,
		});

		const text = formatPathDecision(decision);
		const json = toFlnWhyJson(input, decision);

		return structuredTextResult(
			text,
			json as unknown as Record<string, unknown>,
		);
	} catch (error) {
		if (error instanceof Error)
			return errorResult(`fln_why failed: ${error.message}`);

		return errorResult(`fln_why failed: ${String(error)}`);
	}
}

export async function handleDoctor(
	args: DoctorArgs,
	options: FlnMcpOptions,
): Promise<CallToolResult> {
	const input = resolveInput(args.input, options.defaultInput);

	try {
		const report = await doctor({
			input,
			maxTokens: args.maxTokens,
			exclude: args.exclude,
			include: args.include,
			only: args.only,
		});

		const text = formatDoctorText(report);
		const json = toFlnDoctorJson(report);

		return structuredTextResult(
			text,
			json as unknown as Record<string, unknown>,
		);
	} catch (error) {
		if (error instanceof Error)
			return errorResult(`fln_doctor failed: ${error.message}`);

		return errorResult(`fln_doctor failed: ${String(error)}`);
	}
}

export async function handlePlan(
	args: PlanArgs,
	options: FlnMcpOptions,
): Promise<CallToolResult> {
	const input = resolveInput(args.input, options.defaultInput);

	try {
		const planResult = await plan({
			input,
			budget: args.budget,
			relevant: args.relevant,
			exclude: args.exclude,
			include: args.include,
			only: args.only,
			logLevel: "silent",
		});

		const text = formatPlanText(planResult);

		return structuredTextResult(
			text,
			planResult as unknown as Record<string, unknown>,
		);
	} catch (error) {
		if (error instanceof Error)
			return errorResult(`fln_plan failed: ${error.message}`);

		return errorResult(`fln_plan failed: ${String(error)}`);
	}
}

export async function handleDiff(args: DiffArgs): Promise<CallToolResult> {
	try {
		const diffResult = await diff({
			before: args.before,
			after: args.after,
		});

		const text = formatDiffText(diffResult);

		return structuredTextResult(
			text,
			diffResult as unknown as Record<string, unknown>,
		);
	} catch (error) {
		if (error instanceof Error)
			return errorResult(`fln_diff failed: ${error.message}`);

		return errorResult(`fln_diff failed: ${String(error)}`);
	}
}

export async function handleReadResource(
	uri: string,
	options: FlnMcpOptions,
): Promise<ReadResourceResult> {
	const input = resolveInput(undefined, options.defaultInput);
	const maxBytes = options.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;

	if (uri.startsWith("fln_file://")) {
		const filePath = uri.slice("fln_file://".length);
		const absolutePath = resolve(input, filePath);
		const relativePath = relative(input, absolutePath);
		if (relativePath.startsWith(".."))
			throw flnError(
				"INVALID_CONFIG",
				`Path outside input directory: ${filePath}`,
				{ path: filePath, hint: "Use a path under the MCP default input." },
			);

		const content = await readFile(absolutePath, "utf8");

		return {
			contents: [{ uri, mimeType: "text/plain", text: content }],
		};
	}

	if (uri.startsWith("fln_snapshot://")) {
		const tempDir = await mkdtemp(join(tmpdir(), "fln-mcp-res-"));
		const tempFile = join(tempDir, "snapshot.md");

		try {
			const pipeline = await runFlnPipeline({
				input,
				output: tempFile,
				overwrite: true,
				format: "md",
				logLevel: "silent",
			});
			await writeOutput(pipeline.scan, pipeline.config, pipeline.logger);
			const content = await readFile(tempFile, "utf8");
			const contentBytes = Buffer.byteLength(content);

			if (contentBytes > maxBytes)
				throw flnError(
					"LIMIT_EXCEEDED",
					`Snapshot is ${contentBytes} bytes — exceeds inline limit of ${maxBytes} bytes.`,
					{
						hint: "Use fln_snapshot tool with --exclude/--only to reduce scope.",
					},
				);

			return {
				contents: [{ uri, mimeType: "text/markdown", text: content }],
			};
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	throw flnError("INVALID_CONFIG", `Unknown resource URI: ${uri}`, {
		hint: "Supported: fln_file://… and fln_snapshot://…",
	});
}

export type McpHttpServerHandle = {
	port: number;
	close: () => Promise<void>;
};

function createConfiguredMcpServer(options: FlnMcpOptions): Server {
	const server = new Server(
		{ name: "fln", version: VERSION },
		{ capabilities: { tools: {}, resources: {} } },
	);

	server.setRequestHandler(ListToolsRequestSchema, () => ({
		tools: ALL_TOOLS,
	}));

	server.setRequestHandler(ListResourcesRequestSchema, () => ({
		resources: [] as Resource[],
	}));

	server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
		resourceTemplates: RESOURCE_TEMPLATES,
	}));

	server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
		const { uri } = request.params;

		return await handleReadResource(uri, options);
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: rawArgs } = request.params;
		const args = rawArgs ?? {};

		try {
			switch (name) {
				case "fln_snapshot":
					return await handleSnapshot(args as unknown as SnapshotArgs, options);
				case "fln_why":
					return await handleWhy(args as unknown as WhyArgs, options);
				case "fln_doctor":
					return await handleDoctor(args as unknown as DoctorArgs, options);
				case "fln_plan":
					return await handlePlan(args as unknown as PlanArgs, options);
				case "fln_diff":
					return await handleDiff(args as unknown as DiffArgs);
				default:
					return errorResult(`Unknown tool: ${name}`);
			}
		} catch (error) {
			if (error instanceof Error)
				return errorResult(`${name} failed: ${error.message}`);

			return errorResult(`${name} failed: ${String(error)}`);
		}
	});

	return server;
}

/** Start MCP over Streamable HTTP. Use `port: 0` for an ephemeral port (tests). */
export async function startMcpHttpServer(
	options: FlnMcpOptions = {},
): Promise<McpHttpServerHandle> {
	const server = createConfiguredMcpServer(options);
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});
	const httpServer = createServer(async (request, response) => {
		await transport.handleRequest(request, response);
	});

	const requestedPort = options.port ?? 3000;
	await new Promise<void>((resolveListen, rejectListen) => {
		httpServer.once("error", rejectListen);
		httpServer.listen(requestedPort, "127.0.0.1", () => {
			httpServer.off("error", rejectListen);
			resolveListen();
		});
	});

	const address = httpServer.address();
	const port =
		typeof address === "object" && address !== null
			? address.port
			: requestedPort;

	await server.connect(transport);

	return {
		port,
		close: async () => {
			await server.close();
			await new Promise<void>((resolveClose, rejectClose) => {
				httpServer.close((error) => {
					if (error) rejectClose(error);
					else resolveClose();
				});
			});
		},
	};
}

export async function mcp(options: FlnMcpOptions = {}): Promise<void> {
	if (options.http) {
		const handle = await startMcpHttpServer({
			...options,
			port: options.port ?? 3000,
		});
		console.error(
			`fln MCP HTTP server listening on http://127.0.0.1:${handle.port}`,
		);

		return;
	}

	const server = createConfiguredMcpServer(options);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
