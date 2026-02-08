<!-- 🥞 fln 1.0.0 -->

# Codebase Snapshot: ts-app

Generated: 2026-01-01 00:00
Files: 8 | Directories: 2

---

## Directory Tree
```text
├── README.md
├── package.json
├── tsconfig.json
└── src
    ├── index.ts
    ├── config.ts
    ├── formatter.ts
    ├── processor.ts
    └── reader.ts
```

---

## Source Files

### README.md
```md
# ts-app

TypeScript app example.
```

### package.json
```json
{
	"name": "ts-app",
	"version": "0.1.0",
	"type": "module",
	"description": "Compact TypeScript example project for fln.",
	"scripts": {
		"start": "node ./dist/index.js"
	}
}
```

### tsconfig.json
```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ES2022",
		"moduleResolution": "Bundler",
		"strict": true,
		"outDir": "dist"
	},
	"include": [
		"src/**/*.ts"
	]
}
```

### src/index.ts
```ts
import { loadConfig } from "./config";
import { formatReport } from "./formatter";
import { buildReport } from "./processor";
import { readLines } from "./reader";

async function main(): Promise<void> {
	const config = loadConfig();
	const lines = await readLines(config.inputPath);
	console.log(formatReport(buildReport(config.projectName, lines, config.minLineLength)));
}

void main();
```

### src/config.ts
```ts
export type AppConfig = {
	projectName: string;
	inputPath: string;
	minLineLength: number;
};

export const loadConfig = (): AppConfig => ({
	projectName: "ts-app",
	inputPath: "sample.txt",
	minLineLength: 3
});
```

### src/formatter.ts
```ts
import type { Report } from "./processor";

export const formatReport = (report: Report): string => {
	const lines = [
		`Project: ${report.projectName}`,
		`Lines: ${report.lineCount}`,
		"Filtered:"
	];
	lines.push(...report.filteredLines.map((line) => `- ${line}`));
	return lines.join("\n");
};
```

### src/processor.ts
```ts
export type Report = {
	projectName: string;
	lineCount: number;
	filteredLines: string[];
};

export const buildReport = (
	projectName: string,
	lines: string[],
	minLineLength: number
): Report => {
	const filteredLines = lines.filter((line) => line.length >= minLineLength);
	return {
		projectName,
		lineCount: lines.length,
		filteredLines
	};
};
```

### src/reader.ts
```ts
import { readFile } from "node:fs/promises";

export const readLines = async (path: string): Promise<string[]> => {
	try {
		const content = await readFile(path, "utf-8");
		return content.split("\n").filter((line) => line.trim().length > 0);
	} catch {
		return [ "alpha", "beta", "gamma", "delta" ];
	}
};
```
