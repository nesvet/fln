#!/usr/bin/env node

import { runCommandLine } from "./commandLine";


try {
	await runCommandLine();
} catch (error) {
	console.error(`ERROR  ${String(error)}`);
	process.exit(1);
}
