#!/usr/bin/env bun

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fln } from "../src/api/index.js";


const examplesDir = resolve(import.meta.dir, "..", "examples");

const names = readdirSync(examplesDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);

for (const name of names)
	await fln({
		rootDirectory: join(examplesDir, name),
		outputFile: join(examplesDir, `${name}.md`),
		overwrite: true,
		generatedDate: "2026-01-01 00:00"
	});

console.info(`✓ Generated ${names.length} snapshot(s)`);
