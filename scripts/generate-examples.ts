#!/usr/bin/env bun

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fln } from "../src/api/fln";


const root = resolve(import.meta.dir, "..");
const examplesDir = join(root, "examples");

const entries = readdirSync(examplesDir, { withFileTypes: true });
const names = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

for (const name of names) {
	await fln({
		rootDirectory: join(examplesDir, name),
		outputFile: join(examplesDir, `${name}.md`),
		generatedDate: "2026-01-01 00:00"
	});
	
	console.info(`Generated ${join("examples", `${name}.md`)}`);
}

console.info(`Done. ${names.length} snapshot(s) written.`);
