#!/usr/bin/env node

import { runCommandLine } from "./commandLine.js";
import { formatFlnCliError, resolveExitCode } from "./flnErrorOutput.js";

try {
	await runCommandLine();
} catch (error) {
	console.error(formatFlnCliError(error));

	if (process.env.DEBUG && error instanceof Error && error.stack) {
		console.error("\nStack trace:");
		console.error(error.stack);
	}

	process.exit(resolveExitCode(error));
}
