#!/usr/bin/env node

import { runCommandLine } from "./commandLine.js";


try {
	await runCommandLine();
} catch (error) {
	console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
	
	if (process.env.DEBUG && error instanceof Error && error.stack) {
		console.error("\nStack trace:");
		console.error(error.stack);
	}
	
	process.exit(1);
}
