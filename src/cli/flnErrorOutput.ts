import { FlnError } from "../infra/flnError.js";

export function formatFlnCliError(error: unknown): string {
	if (error instanceof FlnError) {
		const lines = [`fln: [${error.code}] ${error.message}`];
		if (error.hint) lines.push(`Hint: ${error.hint}`);

		return lines.join("\n");
	}

	return `fln: ${error instanceof Error ? error.message : String(error)}`;
}

export function resolveExitCode(error: unknown): number {
	if (!(error instanceof FlnError)) return 1;

	switch (error.code) {
		case "NO_FILES_INCLUDED":
			return 2;
		case "LIMIT_EXCEEDED":
			return 3;
		default:
			return 1;
	}
}
