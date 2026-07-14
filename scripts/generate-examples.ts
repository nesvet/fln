#!/usr/bin/env bun

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fln } from "../src/api/index.js";

const examplesDir = resolve(import.meta.dir, "..", "examples");

const names = readdirSync(examplesDir, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);

for (const name of names)
	await fln({
		input: join(examplesDir, name),
		output: join(examplesDir, `${name}.md`),
		overwrite: true,
		date: "2026-02-26 00:00",
	});

console.info(`✓ Generated ${names.length} snapshot(s)`);
