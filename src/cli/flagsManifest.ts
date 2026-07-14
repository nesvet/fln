import { parseArgs } from "node:util";

export type CliFlagSpec = {
	key: string;
	name: string;
	short?: string;
	type: "boolean" | "string";
	multiple?: boolean;
};

export const CLI_SUBCOMMANDS = [
	"init",
	"why",
	"doctor",
	"mcp",
	"plan",
	"diff",
	"upgrade",
] as const;

export type CliSubcommand = (typeof CLI_SUBCOMMANDS)[number];

export const CLI_FLAG_SPECS: CliFlagSpec[] = [
	{ key: "output", name: "output", short: "o", type: "string" },
	{
		key: "exclude",
		name: "exclude",
		short: "e",
		type: "string",
		multiple: true,
	},
	{
		key: "include",
		name: "include",
		short: "i",
		type: "string",
		multiple: true,
	},
	{ key: "only", name: "only", type: "string", multiple: true },
	{ key: "relevant", name: "relevant", type: "string", multiple: true },
	{ key: "stdin", name: "stdin", type: "boolean" },
	{ key: "ext", name: "ext", type: "string" },
	{ key: "includeHidden", name: "include-hidden", type: "boolean" },
	{ key: "noGitignore", name: "no-gitignore", type: "boolean" },
	{ key: "maxFileSize", name: "max-file-size", type: "string" },
	{ key: "maxTotalSize", name: "max-total-size", type: "string" },
	{ key: "maxTokens", name: "max-tokens", type: "string" },
	{ key: "budget", name: "budget", type: "string" },
	{ key: "maxContentTokens", name: "max-content-tokens", type: "string" },
	{ key: "tokenModel", name: "token-model", type: "string" },
	{ key: "securityCheck", name: "security-check", type: "string" },
	{ key: "recommendBudget", name: "recommend-budget", type: "string" },
	{ key: "http", name: "http", type: "boolean" },
	{ key: "port", name: "port", type: "string" },
	{ key: "strictLimits", name: "strict-limits", type: "boolean" },
	{ key: "strictToctou", name: "strict-toctou", type: "boolean" },
	{ key: "annotateTree", name: "annotate-tree", type: "string" },
	{ key: "collectTodo", name: "collect-todo", type: "boolean" },
	{ key: "compress", name: "compress", type: "boolean" },
	{ key: "outline", name: "outline", type: "boolean" },
	{ key: "diffHunks", name: "diff-hunks", type: "boolean" },
	{ key: "encoding", name: "encoding", type: "string" },
	{ key: "outputSplit", name: "output-split", type: "string" },
	{ key: "noContents", name: "no-contents", type: "boolean" },
	{ key: "noTree", name: "no-tree", type: "boolean" },
	{ key: "format", name: "format", type: "string" },
	{ key: "dryRun", name: "dry-run", type: "boolean" },
	{ key: "stdout", name: "stdout", type: "boolean" },
	{ key: "copy", name: "copy", type: "boolean" },
	{ key: "overwrite", name: "overwrite", short: "w", type: "boolean" },
	{ key: "quiet", name: "quiet", short: "q", type: "boolean" },
	{ key: "verbose", name: "verbose", short: "V", type: "boolean" },
	{ key: "debug", name: "debug", type: "boolean" },
	{ key: "noAnsi", name: "no-ansi", type: "boolean" },
	{ key: "followSymlinks", name: "follow-symlinks", type: "boolean" },
	{ key: "noSponsorMessage", name: "no-sponsor-message", type: "boolean" },
	{ key: "noLocalState", name: "no-local-state", type: "boolean" },
	{ key: "ignoreConfig", name: "ignore-config", type: "boolean" },
	{ key: "date", name: "date", type: "string" },
	{ key: "banner", name: "banner", type: "string" },
	{ key: "bannerFile", name: "banner-file", type: "string" },
	{ key: "footer", name: "footer", type: "string" },
	{ key: "footerFile", name: "footer-file", type: "string" },
	{ key: "since", name: "since", type: "string" },
	{ key: "version", name: "version", short: "v", type: "boolean" },
	{ key: "help", name: "help", short: "h", type: "boolean" },
];

export const INIT_FLAG_NAMES = ["overwrite", "help", "version"] as const;

export const FLATTEN_FORMAT_VALUES = ["md", "json"] as const;
export const TEXT_JSON_FORMAT_VALUES = ["text", "json"] as const;

export type FlattenFormat = (typeof FLATTEN_FORMAT_VALUES)[number];
export type TextJsonFormat = (typeof TEXT_JSON_FORMAT_VALUES)[number];

type ParseArgsOption = {
	type: "boolean" | "string";
	short?: string;
	multiple?: boolean;
};

export type ParsedCliFlags = {
	output?: string;
	exclude?: string[];
	include?: string[];
	only?: string[];
	relevant?: string[];
	stdin?: boolean;
	ext?: string;
	includeHidden?: boolean;
	noGitignore?: boolean;
	maxFileSize?: string;
	maxTotalSize?: string;
	maxTokens?: string;
	budget?: string;
	maxContentTokens?: string;
	tokenModel?: string;
	securityCheck?: string;
	recommendBudget?: string;
	http?: boolean;
	port?: string;
	strictLimits?: boolean;
	strictToctou?: boolean;
	annotateTree?: string;
	collectTodo?: boolean;
	compress?: boolean;
	outline?: boolean;
	diffHunks?: boolean;
	encoding?: string;
	outputSplit?: string;
	noContents?: boolean;
	noTree?: boolean;
	format?: string;
	dryRun?: boolean;
	stdout?: boolean;
	copy?: boolean;
	overwrite?: boolean;
	quiet?: boolean;
	verbose?: boolean;
	debug?: boolean;
	noAnsi?: boolean;
	followSymlinks?: boolean;
	noSponsorMessage?: boolean;
	noLocalState?: boolean;
	ignoreConfig?: boolean;
	date?: string;
	banner?: string;
	bannerFile?: string;
	footer?: string;
	footerFile?: string;
	since?: string;
	version?: boolean;
	help?: boolean;
};

const specByName = new Map(CLI_FLAG_SPECS.map((spec) => [spec.name, spec]));

export function kebabToCamel(name: string): string {
	return name.replaceAll(/-([\da-z])/g, (_, char: string) =>
		char.toUpperCase(),
	);
}

export function buildFlagAliasMap(): Map<string, string> {
	const aliasMap = new Map<string, string>();
	for (const spec of CLI_FLAG_SPECS) {
		aliasMap.set(spec.name, spec.name);
		if (spec.key !== spec.name) aliasMap.set(spec.key, spec.name);
		const derived = kebabToCamel(spec.name);
		if (derived !== spec.name && derived !== spec.key)
			aliasMap.set(derived, spec.name);
	}

	return aliasMap;
}

export function normalizeArgv(
	argv: string[],
	aliasMap: Map<string, string>,
): string[] {
	return argv.map((arg) => {
		if (!arg.startsWith("--")) return arg;

		const equalsIndex = arg.indexOf("=");
		const rawName =
			equalsIndex === -1 ? arg.slice(2) : arg.slice(2, equalsIndex);
		const canonical = aliasMap.get(rawName);
		if (!canonical) return arg;

		return equalsIndex === -1
			? `--${canonical}`
			: `--${canonical}${arg.slice(equalsIndex)}`;
	});
}

export function buildCliParseOptions(): Record<string, ParseArgsOption> {
	const options: Record<string, ParseArgsOption> = {};
	for (const spec of CLI_FLAG_SPECS) {
		const entry: ParseArgsOption = { type: spec.type };
		if (spec.short) entry.short = spec.short;
		if (spec.multiple) entry.multiple = true;
		options[spec.name] = entry;
	}

	return options;
}

export function toParsedCliFlags(
	rawValues: Record<string, unknown>,
): ParsedCliFlags {
	const flags: ParsedCliFlags = {};
	for (const [name, value] of Object.entries(rawValues)) {
		if (value === undefined) continue;
		const spec = specByName.get(name);
		if (!spec) continue;
		(flags as Record<string, unknown>)[spec.key] = value;
	}

	return flags;
}

export function parseCliArgv(argv: string[]): {
	flags: ParsedCliFlags;
	positionals: string[];
} {
	const aliasMap = buildFlagAliasMap();
	const normalizedArgv = normalizeArgv(argv, aliasMap);
	const { values, positionals } = parseArgs({
		args: normalizedArgv,
		options: buildCliParseOptions(),
		strict: true,
		allowPositionals: true,
	});

	return {
		flags: toParsedCliFlags(values as Record<string, unknown>),
		positionals,
	};
}

export function flagLongOption(spec: CliFlagSpec): string {
	return `--${spec.name}`;
}

export function flagShortOption(spec: CliFlagSpec): string | undefined {
	return spec.short ? `-${spec.short}` : undefined;
}
