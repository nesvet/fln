import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { FlnOptions } from "../api/types.js";
import {
	resolveConfig,
	resolveFileConfigAtInput,
	resolveSecurityCheck,
	resolveTokenModel,
} from "../config/index.js";
import { parseByteSize } from "../core/index.js";
import { flnError, type TokenModel } from "../infra/index.js";
import {
	buildSinceOnlyPatterns,
	formatNoChangesSinceMessage,
	shouldExitForEmptySince,
} from "../pattern/index.js";
import type { ParsedCliFlags } from "./flagsManifest.js";
import { mapCliNegationToFlnOptions } from "./mapCliFlags.js";

export type DoctorCliValues = Pick<
	ParsedCliFlags,
	| "exclude"
	| "ext"
	| "format"
	| "ignoreConfig"
	| "include"
	| "includeHidden"
	| "maxFileSize"
	| "maxTokens"
	| "noAnsi"
	| "noGitignore"
	| "noLocalState"
	| "noSponsorMessage"
	| "only"
	| "since"
	| "securityCheck"
	| "recommendBudget"
	| "tokenModel"
>;

export type DoctorOutputFormat = "json" | "text";

export type ResolvedDoctorContext = {
	input: string;
	configPath: string;
	configLoaded: boolean;
	configIgnored: boolean;
	format: DoctorOutputFormat;
	pipelineOptions: FlnOptions;
	tokenModel: TokenModel;
	maxTokensWarn?: number;
	recommendBudget?: number;
	skipUsageWrite?: boolean;
	suppressSponsorMessage?: boolean;
};

export type ResolveDoctorResult =
	| { status: "noChangesSince"; message: string; format: DoctorOutputFormat }
	| { status: "ready"; context: ResolvedDoctorContext };

function parseDoctorPositionals(positionals: string[]): string {
	const directory = positionals.find((candidate) => candidate !== "doctor");

	return directory ?? ".";
}

export function parseDoctorOutputFormat(
	format: string | undefined,
): DoctorOutputFormat {
	if (format === undefined || format === "text") return "text";
	if (format === "json") return "json";

	throw flnError(
		"INVALID_CONFIG",
		`Invalid --format for fln doctor: ${format}. Use text or json.`,
	);
}

function parseMaxTokensWarn(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;

	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed < 0)
		throw flnError("INVALID_CONFIG", `Invalid --max-tokens: ${value}`);

	return parsed;
}

function parseRecommendBudget(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;

	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed < 0)
		throw flnError("INVALID_CONFIG", `Invalid --recommend-budget: ${value}`);

	return parsed;
}

export async function resolveDoctorFromCli(
	positionals: string[],
	values: DoctorCliValues,
): Promise<ResolveDoctorResult> {
	const format = parseDoctorOutputFormat(values.format);
	const cwd = process.cwd();
	const input = resolve(cwd, parseDoctorPositionals(positionals));
	const inputStats = await stat(input);
	if (!inputStats.isDirectory())
		throw flnError(
			"INPUT_NOT_DIRECTORY",
			`Input must be a directory: ${input}`,
			{ path: input },
		);

	const { only, onlyMode, sinceFiltered } = buildSinceOnlyPatterns(
		values,
		input,
		cwd,
	);
	if (shouldExitForEmptySince(values, sinceFiltered) && values.since)
		return {
			status: "noChangesSince",
			message: formatNoChangesSinceMessage(values.since, values.ext),
			format,
		};

	const ignoreConfig = values.ignoreConfig ?? false;
	const {
		fileConfig,
		configPath,
		loaded: configLoaded,
		parseError,
	} = await resolveFileConfigAtInput(input, { ignoreConfig });
	if (parseError)
		throw flnError("INVALID_CONFIG", parseError, { path: configPath });
	const forceInclude = values.include ?? [];
	const tokenModel = resolveTokenModel(values.tokenModel);
	const maxTokensWarn = parseMaxTokensWarn(values.maxTokens);
	const recommendBudget = parseRecommendBudget(values.recommendBudget);

	const userConfig = {
		exclude: values.exclude,
		include: forceInclude.length > 0 ? forceInclude : undefined,
		only: only.length > 0 ? only : undefined,
		onlyMode,
		includeHidden: values.includeHidden,
		...mapCliNegationToFlnOptions(values),
		maxFileSize: values.maxFileSize
			? parseByteSize(values.maxFileSize)
			: undefined,
		dryRun: true,
		contents: true,
		logLevel: "silent" as const,
		ansi: false,
		tokenModel,
		securityCheck: values.securityCheck
			? resolveSecurityCheck(values.securityCheck)
			: undefined,
	};

	const config = resolveConfig(input, fileConfig, userConfig);

	return {
		status: "ready",
		context: {
			input,
			configPath,
			configLoaded,
			configIgnored: ignoreConfig,
			format,
			tokenModel: config.tokenModel,
			maxTokensWarn,
			recommendBudget,
			skipUsageWrite: Boolean(values.noLocalState),
			suppressSponsorMessage: Boolean(values.noSponsorMessage),
			pipelineOptions: {
				input,
				ignoreConfig,
				exclude: config.exclude,
				include: config.include,
				only: config.only,
				onlyMode: config.onlyMode ?? config.only.length > 0,
				includeHidden: config.includeHidden,
				gitignore: config.gitignore,
				maxFileSize: config.maxFileSize,
				maxTokens: maxTokensWarn,
				tokenModel: config.tokenModel,
				securityCheck: config.securityCheck,
				dryRun: true,
				contents: true,
				logLevel: "silent",
				ansi: false,
			},
		},
	};
}
