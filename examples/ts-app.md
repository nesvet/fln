<!-- 🥞 fln 2.0.0 · model: estimate -->

# Codebase Snapshot: ts-app

Generated: 2026-02-26 00:00  
Files: 8 (14 scanned) | Directories: 2

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
````md
# ts-app

Minimal TypeScript sample used by `bun run generate:examples` and the VHS hero demo ([`assets/demo.tape`](../../assets/demo.tape): `plan` → emit → `why`).

## `.env.example` (fake secret fixture)

[`./.env.example`](.env.example) holds a **fake** key (`sk-demo-not-a-real-secret`) for security demos — not a real credential.

- fln’s default security patterns (`.env*`) skip content during flatten — secrets never land in the snapshot
- Without `--include-hidden`, `fln why .env.example` stops at `hidden` (dotfile); the demo uses `fln why .env.example --include-hidden` to surface `security` / content omitted
- The app reads `process.env.API_KEY` only; it never prints the key (only `API key configured: yes|no`)

Do not commit a real `.env`. For a local run:

```bash
API_KEY=sk-demo-not-a-real-secret bun src/index.ts
# or: set -a && source .env.example && set +a && bun src/index.ts
```

See also [examples/README.md](../README.md).
````

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
	console.log(
		formatReport(
			buildReport(
				config.projectName,
				lines,
				config.minLineLength,
				Boolean(config.apiKey),
			),
		),
	);
}

void main();
```

### src/config.ts
```ts
export type AppConfig = {
	projectName: string;
	inputPath: string;
	minLineLength: number;
	apiKey: string | undefined;
};

export const loadConfig = (): AppConfig => ({
	projectName: "ts-app",
	inputPath: "sample.txt",
	minLineLength: 3,
	apiKey: process.env.API_KEY,
});
```

### src/formatter.ts
```ts
import type { Report } from "./processor";

export const formatReport = (report: Report): string => {
	const lines = [
		`Project: ${report.projectName}`,
		`Lines: ${report.lineCount}`,
		`API key configured: ${report.apiKeyConfigured ? "yes" : "no"}`,
		"Filtered:",
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
	apiKeyConfigured: boolean;
};

export const buildReport = (
	projectName: string,
	lines: string[],
	minLineLength: number,
	apiKeyConfigured: boolean,
): Report => {
	const filteredLines = lines.filter((line) => line.length >= minLineLength);
	return {
		projectName,
		lineCount: lines.length,
		filteredLines,
		apiKeyConfigured,
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
