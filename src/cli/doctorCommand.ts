import type { DoctorReport } from "../api/doctor.js";
import { formatDoctorText, toFlnDoctorJson } from "../api/doctor.js";
import { fln } from "../api/fln.js";
import {
	FlnError,
	flnError,
	getSponsorTrackingStatus,
	toFlnFailureJson,
} from "../infra/index.js";
import type { ResolveDoctorResult } from "./doctorCli.js";
import { type DoctorCliValues, resolveDoctorFromCli } from "./doctorCli.js";
import { formatFlnCliError, resolveExitCode } from "./flnErrorOutput.js";

function toFailureJson(error: unknown) {
	if (error instanceof FlnError) return toFlnFailureJson(error);

	const message = error instanceof Error ? error.message : String(error);

	return toFlnFailureJson(flnError("INVALID_CONFIG", message));
}

function printDoctorError(error: unknown, useJsonOutput: boolean): void {
	if (useJsonOutput) console.error(JSON.stringify(toFailureJson(error)));
	else console.error(formatFlnCliError(error));
}

function resolveDoctorExitCode(filesIncluded: number): number {
	if (filesIncluded === 0) return 2;

	return 0;
}

export async function runDoctorCommand(
	positionals: string[],
	values: DoctorCliValues,
): Promise<void> {
	const useJsonOutput = values.format === "json";
	let resolved: ResolveDoctorResult;

	try {
		resolved = await resolveDoctorFromCli(positionals, values);
	} catch (error) {
		printDoctorError(error, useJsonOutput);
		process.exit(resolveExitCode(error));
	}

	if (resolved.status === "noChangesSince") {
		console.info(resolved.message);
		process.exit(0);
	}

	const { context } = resolved;
	let report: DoctorReport;
	try {
		report = await fln.doctor({
			input: context.input,
			ignoreConfig: context.configIgnored,
			exclude: context.pipelineOptions.exclude,
			include: context.pipelineOptions.include,
			only: context.pipelineOptions.only,
			onlyMode: context.pipelineOptions.onlyMode,
			includeHidden: context.pipelineOptions.includeHidden,
			gitignore: context.pipelineOptions.gitignore,
			maxFileSize: context.pipelineOptions.maxFileSize,
			tokenModel: context.tokenModel,
			maxTokensWarn: context.maxTokensWarn,
			recommendBudget: context.recommendBudget,
			securityCheck: context.pipelineOptions.securityCheck,
			logLevel: "silent",
			ansi: false,
		});
		report.sponsorTracking = await getSponsorTrackingStatus({
			skipUsageWrite: context.skipUsageWrite,
			suppressSponsorMessage: context.suppressSponsorMessage,
		});
	} catch (error) {
		printDoctorError(error, useJsonOutput);
		process.exit(resolveExitCode(error));
	}

	if (context.format === "json")
		console.info(JSON.stringify(toFlnDoctorJson(report)));
	else console.info(formatDoctorText(report));

	process.exit(resolveDoctorExitCode(report.filesIncluded));
}
