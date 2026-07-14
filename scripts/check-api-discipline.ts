import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const FORBIDDEN_FLAGS = ["noTree", "noContents", "noGitignore", "noAnsi"];
const flagPattern = new RegExp(String.raw`\b(${FORBIDDEN_FLAGS.join("|")})\b`);

function walkDir(dir: string, callback: (filePath: string) => void): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) walkDir(fullPath, callback);
		else if (
			entry.isFile() &&
			(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))
		)
			callback(fullPath);
	}
}

function stripTypeExports(block: string): string {
	return block.replace(/\btype\s+\w+\s*,?/g, "").replace(/,\s*type\s+\w+/g, "");
}

const srcDir = join(process.cwd(), "src");
const cliDir = join(srcDir, "cli");
const apiIndex = join(srcDir, "api", "index.ts");
const violations: string[] = [];

walkDir(srcDir, (filePath) => {
	if (
		filePath === cliDir ||
		filePath.startsWith(`${cliDir}/`) ||
		filePath.startsWith(`${cliDir}\\`)
	)
		return;
	const content = readFileSync(filePath, "utf8");
	const match = content.match(flagPattern);
	if (match)
		violations.push(
			`${relative(process.cwd(), filePath)}: found "${match[1]}"`,
		);
});

const indexContent = readFileSync(apiIndex, "utf8");
for (const match of indexContent.matchAll(
	/\bexport\s*\{([^}]+)\}(?:\s*from\s*["'][^"']+["'])?/gs,
)) {
	const stripped = stripTypeExports(match[1]);
	if (/\b(?:plan|doctor|diff|mcp)\b/.test(stripped))
		violations.push(
			`${relative(process.cwd(), apiIndex)}: standalone operation export — use fln.* namespace`,
		);
}

if (violations.length > 0) {
	console.error(violations.join("\n"));
	process.exit(1);
}
