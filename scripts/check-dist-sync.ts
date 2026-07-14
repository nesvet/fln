import { type Dirent, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const srcDir = join(root, "src");

function walkFiles(dir: string, callback: (filePath: string) => void): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) walkFiles(fullPath, callback);
		else if (entry.isFile()) callback(fullPath);
	}
}

if (!existsSync(distDir)) {
	console.error(
		"check:dist failed: dist/ missing — run bun run build:npm first",
	);
	process.exit(1);
}

const orphans: string[] = [];
const unexpected: string[] = [];

walkFiles(distDir, (filePath) => {
	const rel = relative(distDir, filePath);
	if (rel.endsWith(".js")) {
		const sourceTs = join(srcDir, `${rel.slice(0, -3)}.ts`);
		if (!existsSync(sourceTs)) orphans.push(rel);
		return;
	}
	if (rel.endsWith(".d.ts")) {
		const sourceTs = join(srcDir, `${rel.slice(0, -5)}.ts`);
		if (!existsSync(sourceTs)) orphans.push(rel);
		return;
	}
	unexpected.push(rel);
});

if (orphans.length === 0 && unexpected.length === 0) {
	process.exit(0);
}

console.error("check:dist failed: dist/ is out of sync with src/");
if (orphans.length > 0) {
	console.error("\nOrphan emit (no matching src/**/*.ts):");
	for (const path of orphans.sort()) console.error(`  ${path}`);
}
if (unexpected.length > 0) {
	console.error("\nUnexpected files in dist/ (expected only .js / .d.ts):");
	for (const path of unexpected.sort()) console.error(`  ${path}`);
}
console.error("\nFix: bun run clean && bun run build:npm");
process.exit(1);
