# 🥞 fln

[![CI](https://github.com/nesvet/fln/actions/workflows/ci.yaml/badge.svg)](https://github.com/nesvet/fln/actions/workflows/ci.yaml)
[![npm](https://img.shields.io/npm/v/fln)](https://www.npmjs.com/package/fln)
[![npm downloads](https://img.shields.io/npm/dm/fln)](https://www.npmjs.com/package/fln)
[![license](https://img.shields.io/npm/l/fln)](LICENSE)

**A local, explainable context compiler for AI coding agents. Retrieval without embeddings. Context without a server.**

![fln demo — plan a relevant spine, emit a snapshot, explain exclusions](assets/demo.gif)

fln analyzes your codebase, plans what to include, and emits a single AI-ready file — with diagnostics that explain every decision. Think `tsc` for LLM context: **analyze → plan → emit**, all local.

## Quick start

```bash
npx fln          # or: npm i -g fln · bunx fln · brew install nesvet/tap/fln
fln              # → my-app-1.2.0.md in the current directory
```

```bash
$ fln --no-ansi
✓ my-app-1.2.0.md (42 files, 12_840 tokens)
```

One markdown file — header, directory tree, backtick-safe fences. Paste into Claude, ChatGPT, Gemini, Grok, Cursor, or Copilot; pipe to a CLI LLM (`fln --stdout | llm "..."`); or serve over **MCP**.

````markdown
<!-- 🥞 fln 2.0.0 -->

# Codebase Snapshot: demo-app

Generated: 2026-07-06 17:30
Files: 6 | Directories: 3

---

## Directory Tree
```text
├── README.md
├── package.json
├── src
│   ├── index.ts
│   ├── helper.ts
│   └── utils.ts
└── tests
    └── index.test.ts
```

---

## Source Files

### src/index.ts
```ts
import { helper } from "./helper";
import { format } from "./utils";

export function main(): string {
  return format(helper());
}
```
````

[Why](#why-fln) · [Compare](#how-fln-compares) · [Workflows](#workflows) · [Install](#install) · [Usage](#usage) · [API](#api) · [FAQ](#faq)

### Who it's for

- CI budget guards, reproducible snapshots, offline packing
- MCP context-server for agents that need planned, explainable context
- Import-graph retrieval (`--relevant`) without embeddings

### Who it's not for

- Remote-only one-shot digests ([gitingest](https://github.com/coderamp-labs/gitingest), [repomix](https://github.com/yamadashy/repomix) `--remote`)
- IDE live `@codebase` on huge repos (Cursor)
- Tree-sitter-first compression as the main goal (repomix `--compress`)

---

## Why fln

If you use LLMs on real projects, you've hit these limits:

- **Context windows** — the whole project doesn't fit
- **Upload friction** — picking dozens of files every session
- **Partial understanding** — the model sees fragments, not the architecture
- **No explainability** — why was this file excluded? was that secret filtered?

**fln treats codebase context the way `tsc` treats TypeScript**: analyze, plan, emit — with diagnostics (`why`, `doctor`, `plan`, `diff`) and MCP.

JIT agent retrieval (tool calls, embeddings, live search) is great for interactive exploration. fln is the complementary **AOT snapshot compiler**: it builds a deterministic context spine *before* the agent starts — structure-based retrieval (imports, priority, token budgets), no embeddings, no server. Same input → same snapshot; CI-friendly; offline.

---

## How fln compares

| | **fln** | **repomix** | **code2prompt** | **gitingest** | **Cursor `@codebase`** |
|---|---|---|---|---|---|
| **Role** | Context compiler + diagnostics | Feature-rich packer | Prompt templating CLI | Web + CLI digest | IDE retrieval |
| **Local-first** | ✓ | ✓ | ✓ | ✓ (CLI) | ✗ cloud |
| **MCP** | ✓ 5 tools + resources | ✓ | ✓ | ✗ | ✗ |
| **`why` / `doctor` / `plan` / `diff`** | ✓ first-class CLI | ✗ | ✗ | ✗ | ✗ |
| **Import-graph (`--relevant`)** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **`--stdin` pipe** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Native binary** | ✓ | ✗ | ✓ (Rust) | ✗ | n/a |
| **Remote repo** | ✗ | ✓ | ✗ | ✓ | n/a |
| **Tree-sitter compress** | ✗ (line-based) | ✓ | ✗ | ✗ | n/a |
| **Web UI** | ✗ | ✓ | ✓ | ✓ | IDE |

### When to use what

- **fln** — CI budget guards, MCP context-server, reproducible snapshots, `why`/`doctor`/`plan`/`diff`, `--relevant`, `--stdin`
- **repomix** — remote repos, Tree-sitter `--compress`, watch mode, web UI
- **code2prompt** — Handlebars prompt templates and custom prompt pipelines
- **gitingest** — quick web digest / `hub`→`ingest` URL trick
- **Cursor `@codebase`** — live IDE retrieval on large repos

Not mutually exclusive: fln and repomix both produce paste-ready files; fln adds the compiler/diagnostics layer.

---

## Workflows

### Plan before you flatten

`fln plan` assigns fidelity per file and projects tokens before you spend the budget. With `--relevant`, only the import-graph neighborhood of the seed is included:

```bash
$ fln plan --relevant src/cli/index.ts --budget 200000
```

```
# Context Plan: .

Budget: 200,000 tokens
Projected: 67,149 tokens
Files included: 100
Files omitted: 1

## Included files

  src/api/index.ts — ~239 tokens (entry point — high priority)
  src/cli/index.ts — ~89 tokens (seed file)
  src/cli/output/index.ts — ~28 tokens (entry point — high priority)
  ...
```

Full output: [`assets/demo-plan.md`](assets/demo-plan.md). Use `--format json` for CI/agents. Formal schema: [schema/fln-plan.json](schema/fln-plan.json) (`$id`: `https://fln.nesvet.dev/schema/plan`).

```bash
fln plan --budget 200000
fln plan --relevant src/cli/index.ts --budget 200000
fln plan --format json
```

### Explain, preflight, MCP

```bash
fln why .env                    # why is .env excluded?
fln why src/index.ts            # why is index.ts included?
fln why .env --format json      # machine-readable for CI/agents

fln doctor .                    # config, git, scan stats, token estimate
fln doctor --max-tokens 200000  # warn if over budget
fln doctor --format json --recommend-budget 200000

fln mcp                         # stdio MCP server
fln mcp --http --port 3000      # Streamable HTTP
```

`fln why` is a first-class path-decision CLI with stable reasons (gitignore, security, size, whitelist, …) and JSON for agents.

| MCP tool | What it does |
|---|---|
| `fln_snapshot` | Flatten → markdown/JSON inline |
| `fln_plan` | Budget plan — fidelity per file |
| `fln_diff` | Diff two snapshots |
| `fln_why` | Explain include/exclude |
| `fln_doctor` | Preflight diagnostics |

Resources: `fln_file://{path}`, `fln_snapshot://{name}`.

```json
{
  "mcpServers": {
    "fln": { "command": "fln", "args": ["mcp"] }
  }
}
```

### Compose with your tools

`--stdin` force-includes piped paths (like `-i`), then prunes the tree to exactly that set. Security still applies — detected secrets are never embedded:

```bash
git ls-files                | fln --stdin -o snapshot.md
git ls-files --others       | fln --stdin -o untracked.md
git diff --name-only HEAD~1 | fln --stdin --stdout
rg -l TODO                  | fln --stdin --stdout
git diff --name-only main   | fln plan --stdin --budget 50000
```

```bash
fln --copy                  # clipboard (32 MiB default; FLN_COPY_MAX_BYTES to override)
fln --stdout | llm "What are the biggest architecture issues here?"
fln --stdout | pbcopy       # fallback when --copy isn't available
```

```bash
fln --since main --ext ts,tsx
fln --since main --diff-hunks
fln --relevant src/index.ts --outline
fln --banner-file .prompt.md
fln --banner "Review this codebase for security vulnerabilities."
```

---

## Highlights

| | |
|---|---|
| Single-pass I/O | Scan reads metadata only; render does the one full content read |
| Diagnostics | `why`, `doctor`, `plan`, `diff` — text + JSON schemas |
| MCP | Five tools + file/snapshot resources (stdio or HTTP) |
| Import-graph | `--relevant` for TS/JS/Py/Go/Rust/Java/C — no embeddings |
| Security | Path patterns + entropy + known-secret formats on headers ([SECURITY.md](SECURITY.md)) |
| Native binary | No Node required (`curl` install / Homebrew / `fln upgrade`) |
| Deterministic | Stable ordering; `--date` for reproducible builds |
| Token budget | `--max-tokens` / `plan --budget` with priority ordering |

**Performance:** linux-x64 CI baselines for the medium fixture (5000 files) — dry-run ~1.1s, full flatten ~2.4s (median; gate = baseline +10%). Details: [`benchmarks/README.md`](benchmarks/README.md).

<details>
<summary>Full capability list</summary>

- Parallel scan; respects `.gitignore`; skips binaries/lockfiles; configurable size limits
- Directory-aware file order (README/entry/config first; tests/`vendor/` deprioritized)
- Token count every run; `--verbose` extension breakdown; self-aware (skips prior fln output)
- Backtick-safe fences (adapts to max run + safety margin for large samples)
- Project metadata naming from `package.json`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `go.mod`, …
- Output: `md` / `json`; `--compress` / `--outline` (custom line-based signatures, not Tree-sitter)
- `--max-total-size` graceful omit; `--strict-limits` for CI; `doctor --recommend-budget`
- TOCTOU warn/throw (`--strict-toctou`); `--annotate-tree`; `--collect-todo` (same content pass)
- `--dry-run`; namespace API: `fln()`, `.inspect()`, `.explain()`, `.doctor()`, `.plan()`, `.diff()`, `.mcp()`
- `omittedFiles` in JSON (flat, capped, all reasons)

</details>

---

## Privacy

- **No network** during normal runs (`flatten`, `why`, `doctor`, `plan`, `diff`, `mcp`). `fln upgrade` is the explicit exception.
- Local `~/.config/fln/usage.json` may store `runCount` / `lastRun` only (sponsor message on runs 5 and 25). Hide: `FLN_NO_SPONSOR=1` or `--no-sponsor-message`. Skip write: `--no-local-state`.

---

## Install

```bash
npx fln                    # run once
bunx fln
npm install -g fln
bun add -g fln

# Native binary — no Node required
curl -fsSL https://fln.nesvet.dev/install | sh
powershell -c "irm fln.nesvet.dev/install.ps1 | iex"

brew install nesvet/tap/fln
# Homebrew 6.0+: trust the formula on first use
brew trust --formula nesvet/tap/fln

fln upgrade                # binary self-update (sha256 + optional cosign)
```

<details>
<summary>More installation options · shell completions</summary>

**Pin version / custom dir (macOS/Linux):**

```bash
curl -fsSL https://fln.nesvet.dev/install | FLN_VERSION="<version>" INSTALL_DIR="$HOME/.local/bin" sh
```

**Windows:**

```powershell
$env:FLN_VERSION = "<version>"
$env:INSTALL_DIR = "$env:LOCALAPPDATA\fln\bin"
powershell -c "irm fln.nesvet.dev/install.ps1 | iex"
```

**Manual GitHub Release:**

```bash
curl -L "https://github.com/nesvet/fln/releases/latest/download/fln-macos-x64.tar.gz" | tar -xz -C /usr/local/bin
chmod +x /usr/local/bin/fln
```

**Completions** (bash / zsh / fish / PowerShell) — from a clone: `source completions/_fln` (zsh), `source completions/fln.bash`, etc. After `npm i -g fln`: `source "$(npm root -g)/fln/completions/_fln"`. Regenerate: `bun run generate:completions`.

</details>

---

## Usage

```bash
fln [directory] [...flags]
fln init [--overwrite]
fln why <path> [directory] [...flags]
fln doctor [directory] [...flags]
fln plan [directory] [--budget <n>] [--relevant <seed>] [...flags]
fln diff <before> <after> [...flags]
fln diff --since <ref>
fln mcp [directory]
fln upgrade
```

```bash
fln                              # → my-app-1.2.0.md
fln . -o context.md
fln src -o .                     # scan src/, write to project root
fln -e "*.test.ts" -e "fixtures/"
fln -e "*.md" -e '!README.md'
fln --ext ts,tsx --since HEAD~1
fln -i "src/generated/schema.ts" # force-include gitignored file
fln --only "**/*.ts"
fln why .env --include-hidden
fln --dry-run --verbose
fln --format json -o snapshot.json
fln mcp
```

### Filtering model (2.x)

| Mechanism | Effect |
|-----------|--------|
| `-e` / `exclude` | Exclude; `!pattern` un-ignores **after** `.gitignore` |
| `-i` / `include` | **Force-include** (bypasses ignore + hidden) |
| `--stdin` / `stdinPaths` | Force-include + prune to piped set |
| `--only` / `--since` / `--ext` | **Whitelist** |
| `--include-hidden` | All dotfiles; not required for `-i .env` |
| Security patterns | Force-include shows node in tree; **content never** for secrets |

Files over `--max-file-size` are skipped unless force-included (`-i` / `--stdin`); content streams at render. See [SECURITY.md](SECURITY.md).

<details>
<summary>All CLI flags</summary>

Canonical list: `fln --help`. Config: [`fln.json`](#config-file) / [schema/fln.json](schema/fln.json). API: [below](#api).

Multi-word flags accept **camelCase** aliases (e.g. `--maxFileSize`, `--noTree`) — docs use kebab-case.

**Subcommands**

| Command | Description |
|---|---|
| `fln init` | Create `fln.json` and `.mcp.json` from templates |
| `fln why <path>` | Explain include/exclude (`--format text\|json`) |
| `fln doctor [dir]` | Preflight: config, git, stats, token estimate (`--format text\|json`) |
| `fln plan [dir]` | Budget plan — fidelity per file (`--budget`, `--relevant`, `--format`) |
| `fln diff <before> <after>` | Snapshot diff — added/removed/changed, tree-delta |
| `fln mcp [dir]` | MCP server (stdio or `--http`) |
| `fln upgrade` | Install latest binary (sha256 required; cosign when on PATH) |

**Output**

| Flag | Description |
|---|---|
| `-o, --output <path>` | Output file or directory. Adds `.md`/`.json` if no extension. Default: `<n>-<version>.md` |
| `-w, --overwrite` | Overwrite instead of numeric suffix |
| `--stdout` | Write to stdout (implies `--quiet`) |
| `--copy` | Clipboard copy (implies `--quiet`; not with `-o`, `--stdout`, `--dry-run`, `--output-split` > 1) |
| `--ignore-config` | Skip `fln.json` |
| `--format <md\|json>` | Output format (default: `md`) |
| `--dry-run` | Scan/report without writing |
| `--output-split <n>` | Max output parts when split by limits (default: 1) |

**Filtering**

| Flag | Description |
|---|---|
| `-e, --exclude <glob>` | Exclude — repeatable; `!` un-ignores after `.gitignore` |
| `-i, --include <glob>` | Force-include (additive; repeatable) |
| `--only <glob>` | Whitelist (repeatable) |
| `--stdin` | Paths from stdin — force-include + prune |
| `--ext <ext>` | Whitelist extensions, e.g. `ts,tsx,js` |
| `--since <ref>` | Whitelist: changed since git ref |
| `--include-hidden` | Include hidden files/dirs |
| `--no-gitignore` | Ignore `.gitignore` |
| `--max-file-size <size>` | Max file size, e.g. `10mb` |
| `--max-total-size <size>` | Max output size; graceful omit unless `--strict-limits` |
| `--max-tokens <n>` | Token budget (priority: README/config before tests) |
| `--max-content-tokens <n>` | Token budget for source sections only |
| `--token-model <model>` | `estimate`, `gpt-4`, `gpt-4o`, `gpt-5`, `claude`, `gemini` (see [Token models](#token-models)) |
| `--security-check <default\|strict>` | default: 512 B header; strict: 4 KiB, expanded patterns |
| `--strict-limits` | Throw when limits exceeded |
| `--follow-symlinks` | Follow symlinks |

**Content**

| Flag | Description |
|---|---|
| `--no-contents` | Tree only |
| `--no-tree` | No directory tree |
| `--compress` | Signatures where supported; full content elsewhere |
| `--outline` | Signatures only |
| `--relevant <path>` | Import-graph neighborhood (repeatable) |
| `--strict-toctou` | Throw if file changed between scan and render |
| `--diff-hunks` | With `--since`: unified diff instead of full files. With `fln diff`: intra-file hunks |
| `--annotate-tree <tokens\|lines\|size>` | Annotate tree; `tokens`/`lines` defer tree to end |
| `--collect-todo` | Collect TODO/FIXME/… markers |
| `--encoding <auto\|utf8\|latin1>` | Text encoding |
| `--banner` / `--banner-file` | Prepend text/file |
| `--footer` / `--footer-file` | Append text/file |
| `--date <YYYY-MM-DD HH:mm>` | Fixed Generated date |

**Doctor:** `--recommend-budget <n>`. **MCP:** `--http`, `--port <n>` (default 3000).

**Logging:** `-q` / `-V` / `--debug` / `--no-ansi` / `--no-sponsor-message` / `--no-local-state` / `-v` / `-h`.

> Quote globs: `"*.test.ts"`. Un-exclude: `-e "*.md" -e '!README.md'`.

</details>

---

## Config file

```bash
fln init
```

Writes `fln.json` with JSON Schema IntelliSense (`$schema`: `https://fln.nesvet.dev/schema`).

<details>
<summary>fln.json reference</summary>

```json
{
  "$schema": "https://fln.nesvet.dev/schema",
  "output": "output.md",
  "exclude": [],
  "include": [],
  "only": [],
  "includeHidden": false,
  "maxFileSize": "10mb",
  "maxTotalSize": "0",
  "maxTokens": 0,
  "maxContentTokens": 0,
  "tokenModel": "estimate",
  "strictLimits": false,
  "encoding": "auto",
  "format": "md",
  "followSymlinks": false,
  "overwrite": false
}
```

Additional keys (`gitignore`, `banner`, `securityPatterns`, …): [schema/fln.json](schema/fln.json) and [API](#api). Patterns are gitignore-style relative to input; CLI merges with the file (`--ignore-config` skips it).

</details>

---

## CI/CD and automation

Fresh `codebase.md` on every push — download anytime to chat about the exact state of main or a PR:

```yaml
# .github/workflows/codebase-snapshot.yaml
name: Snapshot Codebase

on:
  push:
    branches: ["main"]
  pull_request:

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Generate snapshot
        run: npx fln . -o codebase.md -w --no-ansi
      - uses: actions/upload-artifact@v6
        with:
          name: codebase-snapshot
          path: codebase.md
          retention-days: 7
```

Pre-commit budget guard:

```bash
# .husky/pre-commit
npx fln . --dry-run --max-total-size 5mb
```

---

## API

```bash
npm install fln
```

```typescript
import { fln } from "fln";

const result = await fln({
  input: "./src",
  output: "snapshot.md",
  exclude: ["*.test.ts", "fixtures/"],
  onProgress: (current, total) => {
    process.stdout.write(`\r${current}/${total} files`);
  },
});

console.log(`${result.filesIncluded} files → ${result.outputPath}`);
console.log(`~${result.outputTokenCount.toLocaleString()} tokens`);

const { root, stats } = await fln.inspect({ input: "./src", dryRun: true });
const decision = await fln.explain({ path: ".env", input: "./src" });
const report = await fln.doctor({ input: "./src" });
const planResult = await fln.plan({
  input: "./src",
  budget: 200_000,
  relevant: ["src/index.ts"],
});
const diffResult = await fln.diff({ before: "snapshot-v1.md", after: "snapshot-v2.md" });
await fln.mcp({ defaultInput: "./src" });
```

Formal schemas for JSON: [plan](schema/fln-plan.json) (`$id`: `https://fln.nesvet.dev/schema/plan`), [diff](schema/fln-diff.json) (`$id`: `https://fln.nesvet.dev/schema/diff`).

<details>
<summary>Full API reference</summary>

Matches `FlnOptions` / `FlnResult` / `FlnInspectResult` / `FlnMcpOptions` in the package types.

**Options (`FlnOptions`)**

| Option | Type | Default (API) | Description |
|---|---|---|---|
| `input` | `string` | `process.cwd()` | Directory to flatten |
| `output` | `string` | auto | Output file or directory; `"-"` for stdout |
| `overwrite` | `boolean` | `false` | Overwrite instead of numeric suffix |
| `exclude` | `string[]` | `[]` | Glob patterns to exclude |
| `include` | `string[]` | `[]` | Force-include paths (additive) |
| `only` | `string[]` | `[]` | Whitelist: only matching files |
| `onlyMode` | `boolean` | — | Restrict scan to `only` when set (default `true` if `only` non-empty) |
| `stdinPaths` | `string[]` | — | File paths piped via stdin (CLI: `--stdin`). Force-included (bypasses ignore + hidden), then tree pruned to exactly these. Security patterns still apply. |
| `relevant` | `string[]` | — | Seed paths — only include files transitively imported by these |
| `includeHidden` | `boolean` | `false` | Include hidden files and directories |
| `gitignore` | `boolean` | `true` | Respect `.gitignore` rules |
| `maxFileSize` | `number \| string` | `"10mb"` | Max individual file size |
| `maxTotalSize` | `number \| string` | `0` | Max output size (`0` = unlimited); graceful omit unless `strictLimits` |
| `maxTokens` | `number` | `0` | Max estimated tokens in output (`0` = unlimited) |
| `maxContentTokens` | `number` | `0` | Token budget for source sections only (`0` = use `maxTokens` for entire output) |
| `tokenModel` | `"estimate" \| "gpt-4" \| "gpt-4o" \| "gpt-5" \| "claude" \| "gemini"` | `"estimate"` | Token counter model |
| `tree` | `boolean` | `true` | Include directory tree. CLI: `--no-tree` to exclude. Config `"tree": false` is not overridden by CLI (opt-out flags only) |
| `contents` | `boolean` | `true` | Include file contents. CLI: `--no-contents` for tree-only output |
| `format` | `"md" \| "json"` | `"md"` | Output format |
| `followSymlinks` | `boolean \| "in-root-only"` | `false` | Follow symlinks; config may use `"in-root-only"` |
| `date` | `string` | current time | Fixed `YYYY-MM-DD HH:mm` for Generated header |
| `banner` | `string` | — | Text prepended after header |
| `bannerFile` | `string` | — | File prepended (relative to input; excluded from tree) |
| `footer` | `string` | — | Text appended at end |
| `footerFile` | `string` | — | File appended (relative to input; excluded from tree) |
| `dryRun` | `boolean` | `false` | Scan and stats only — no output file |
| `copy` | `boolean` | `false` | Write to temp file, then copy to system clipboard (CLI: `--copy`) |
| `ignoreConfig` | `boolean` | `false` | Skip `fln.json` (CLI: `--ignore-config`) |
| `strictLimits` | `boolean` | `false` | Throw when limits exceeded instead of graceful omit |
| `strictToctou` | `boolean` | `false` | Throw when a file changed between scan and render (else warn) |
| `compress` | `boolean` | `false` | Signature extraction — imports, types, function signatures (bodies omitted; full content where no extractor) |
| `outline` | `boolean` | `false` | Signatures only — no implementations (implies `contents`) |
| `diffHunks` | `boolean` | `false` | With `since`: embed unified diff hunks instead of full files |
| `since` | `string` | — | Git ref for diff mode (usually set via CLI `--since`) |
| `encoding` | `"auto" \| "utf8" \| "latin1"` | `"auto"` | Text file encoding |
| `securityPatterns` | `string[]` | built-in + config | Extra globs for sensitive paths (detected content never embedded) |
| `outputSplit` | `number` | `1` | Max output parts when split by limits |
| `onProgress` | `(current, total) => void` | — | Progress callback |
| `logLevel` | `"silent" \| "normal" \| "verbose" \| "debug"` | `"silent"` | Log level (CLI defaults to `"normal"` when not quiet) |
| `ansi` | `boolean` | `false` | ANSI colors in log output |

**MCP options (`FlnMcpOptions`)**

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultInput` | `string` | `process.cwd()` | Default input directory if not specified by tool call |
| `maxSnapshotBytes` | `number` | `2 MiB` | Max inline output size for `fln_snapshot` tool |
| `http` | `boolean` | `false` | Start MCP over Streamable HTTP instead of stdio |
| `port` | `number` | `3000` | HTTP listen port when `http` is true |

Config file `logLevel` default in [schema/fln.json](schema/fln.json) is `"normal"` when using `fln.json` alone.

**Diagnostics:** `fln why <path>` from the CLI (`--format json` for agents/CI; not in `fln.json`). SDK: `fln.explain()`.

### Doctor (preflight)

`fln doctor [directory]` runs a **dry-run scan** (metadata only, no flatten file). Same filtering flags as flatten (`-e`, `-i`, `--only`, `--since`, `--ext`, `--stdin`, …).

| Exit | Meaning |
|------|---------|
| `0` | At least one file would be included |
| `1` | Invalid `fln.json` or config error |
| `2` | No files included |

Human output includes config path, git branch/dirty, file counts, estimated size/tokens (±20% vs real flatten), top extensions, and warnings (oversized files, security paths in tree, `--max-tokens` budget). With `--since` and no matching changes, prints the same early message as `fln` and exits `0`.

```bash
fln doctor .
fln doctor --format json --max-tokens 500000
fln doctor --format json --recommend-budget 200000
```

JSON shape: `schemaVersion: 1`, `config` (`loaded`, `path`, optional `ignored` when `--ignore-config`), `git`, `scan`, `estimate`, `extensions`, `warnings`, optional `recommend` (`exclude`, `projectedTokens`, `omittedCount`). Formal schema: [schema/fln-doctor.json](schema/fln-doctor.json) (`$id`: `https://fln.nesvet.dev/schema/doctor`).

```typescript
import { fln, toFlnWhyJson } from "fln";

const report = await fln.doctor({
	input: projectDir,
	recommendBudget: 200_000,
});
const decision = await fln.explain({ path: ".env", input: projectDir });
// why CLI JSON: { schemaVersion: 1, input: "<abs dir>", decision: { relativePath, included, reason, detail? } }
```

`fln.doctor()` does not accept `--no-local-state` or `--no-sponsor-message` — those are CLI-only. Programmatic sponsor status reflects `usage.json` and `FLN_NO_SPONSOR` only.

### JSON flatten output

`--format json` emits a structured document. Top-level **`root`** is the `FileNode` tree; **`options.tree`** / **`options.contents`** are the boolean flags used for that run. The **`files`** array is omitted when `--no-contents` is set.

Formal schema: [schema/fln-output.json](schema/fln-output.json) (`$id`: `https://fln.nesvet.dev/schema/output`).

| Field | Description |
|-------|-------------|
| `schemaVersion` | Always `2` |
| `version` | fln release version |
| `generated` | `YYYY-MM-DD HH:mm` timestamp |
| `projectName` | From project metadata |
| `input` | Absolute path to flattened directory |
| `options` | Effective options echo (see schema) |
| `root` | Directory tree (`FileNode`) |
| `files` | File contents array (when `options.contents` is true) |
| `omittedFiles` | Flat, size-sorted list of omitted files — `{path, reason, size}` — capped at 1000 (present only when files were omitted) |
| `omittedFilesTotal` | Total count of omitted files before capping |
| `omittedFilesTruncated` | `true` when `omittedFiles` was capped (`omittedFilesTotal` > 1000) |
| `stats` | Scan counters (`omittedByReason` after render limits) |

```bash
fln --format json --max-tokens 200000 -o snap.json
jq '.omittedFiles[] | select(.reason=="tokenLimit") | .path' snap.json
```

With `fln why --format json`, errors use `toFlnFailureJson` on stderr (`{ ok: false, error: { code, message, hint? } }`).

**Inspect (`fln.inspect`)** — same options as `fln()`, scan only. Returns `FlnInspectResult`: `projectName`, `root` (`FileNode` with `skipReason`), `stats`.

**Programmatic API surface:** operations on the namespace only — `fln()`, `fln.inspect()`, `fln.explain()`, `fln.doctor()`, `fln.plan()`, `fln.diff()`, `fln.mcp()`. Standalone: `VERSION`, `toFlnWhyJson`, `toFlnDoctorJson`, `toFlnPlanJson`, `toFlnDiffJson`, `toFlnFailureJson`, `formatPlanText`, `formatDoctorText`, `formatDiffText`, `FlnError`, and types.

**Result (`FlnResult`):** `projectName`, `filesIncluded`, `filesScanned`, `directories`, `binary`, `skipped`, `errors`, `totalSizeBytes`, `outputSizeBytes`, `outputTokenCount`, `outputPath` (`"-"` for stdout, `""` when `dryRun` or `copy`).

**Error codes (`FlnError`)**

| Code | Meaning | CLI exit |
|------|---------|----------|
| `INPUT_NOT_DIRECTORY` | `input` is not a directory | 1 |
| `NO_FILES_INCLUDED` | Scan found no includable files | 2 |
| `INVALID_CONFIG` | Invalid size/token limits or incompatible flags | 1 |
| `CLIPBOARD_TOO_LARGE` | `--copy` output exceeds clipboard size cap | 1 |
| `CLIPBOARD_UNAVAILABLE` | No clipboard utility or copy failed | 1 |
| `LIMIT_EXCEEDED` | `--strict-limits` and a limit was hit | 3 |
| `GIT_NOT_FOUND` | `git` not in PATH (`--since`) | 1 |
| `GIT_REF_INVALID` | Invalid ref or not a git repo | 1 |
| `TOCTOU` | `--strict-toctou` and a file changed between scan and render | 1 |
| `READ_FAILED` | Reserved for read failures | 1 |
| `UPGRADE_FAILED` | `fln upgrade` failed | 1 |

```typescript
import { fln, FlnError } from "fln";

try {
	await fln({ input: dir });
} catch (error) {
	if (error instanceof FlnError)
		console.error(error.code, error.hint ?? error.message);
	throw error;
}
```

</details>

---

## FAQ

**How is fln different from repomix?**
Both produce a paste-ready file. repomix is a feature-rich packer (remote repos, Tree-sitter compression, watch mode). fln is a *compiler* with diagnostics — `why`, `doctor`, `plan`, `diff`, `--relevant`, and an MCP server. Pick repomix for one-shot web-chat paste or remote repos; pick fln when you need reproducibility, CI guards, or explainability. See [Compare](#how-fln-compares).

**Do I need embeddings or a server?**
No. fln is fully local — zero network during a normal run. `--relevant` walks the import graph with a zero-dependency line-based parser (TS/JS/Py/Go/Rust/Java/C) — structure-based retrieval, not similarity search.

**Does it work with MCP agents?**
Yes. `fln mcp` starts an MCP server (stdio by default; `--http --port` for Streamable HTTP) exposing `fln_snapshot`, `fln_plan`, `fln_diff`, `fln_why`, and `fln_doctor` to any MCP-aware agent (Claude Code, Cursor, Codex CLI, VS Code). See [Workflows](#workflows).

**Is it safe to pipe secrets?**
Detected secrets are never embedded, even with force-include. fln skips sensitive paths (`.env`, keys, credentials) by pattern, and runs entropy + known-secret detection (AWS, Google, GitHub, Stripe, Slack, Azure, GitLab, JWT, PEM) on file headers. A force-included secret file stays in the tree with `skipReason: "security"` — content is omitted. Detection is not a guarantee — review output before sharing. See [SECURITY.md](SECURITY.md).

**Does `--stdin` bypass `.gitignore`?**
Yes — intentionally. `--stdin` force-includes the piped paths (bypassing `.gitignore`, exclude, and hidden filters, like `-i`), then prunes the tree to exactly that set. That is what makes `git ls-files --others | fln --stdin` work for untracked files. Security patterns still apply; paths resolving outside the input directory are dropped.

**Why AOT instead of JIT retrieval?**
They solve different problems. JIT (Cursor `@codebase`, agentic search) is great for interactive exploration on large repos. AOT (fln) is great for reproducible snapshots, CI context guards, budget planning, and offline workflows — and for explainability. You decide what to include *before* the agent starts. They're complementary; many stacks use both.

**How do I update fln?**
- **npm / Bun:** `npm install -g fln` or `bun add -g fln`
- **Homebrew:** `brew upgrade nesvet/tap/fln`
- **Binary install** (`curl …/install`): `fln upgrade` — downloads the latest GitHub Release, verifies sha256 (required), optionally verifies cosign when `cosign` is on PATH.

---

## Token models

`--token-model` controls how fln estimates token counts for budgets, doctor, and diff deltas.

| Model | Method | Accuracy |
|---|---|---|
| `gpt-4` | BPE (`cl100k_base`) | High for GPT-4 family |
| `gpt-4o`, `gpt-5` | BPE (`o200k_base`) | High for GPT-4o / GPT-5 family |
| `estimate` | Character heuristic (~4 chars/token) | ±~30% on code |
| `claude`, `gemini` | Same heuristic as `estimate` | ±~30% — no public BPE encoders |

Use `gpt-4o` or `gpt-5` when targeting OpenAI models. Use `estimate` for quick checks. Markdown snapshots record the model in the header; `fln diff` uses it for token deltas.

---

## Preview

Real outputs from [`examples/`](examples/):

- [TypeScript](examples/ts-app.md)
- [Python](examples/python-app.md)
- [Go](examples/go-app.md)
- [Rust](examples/rust-app.md)
- [Java](examples/java-app.md)

<details>
<summary>Runtime compatibility</summary>

**Node.js** — requires `>=22.0.0`, ESM-only (`"type": "module"`). Install via `npm i -g fln` or run with `npx`.

**Bun** — requires `>=1.4.0`. Install via `bun add -g fln` or run with `bunx`.

**Standalone binary** — no runtime required. Install via the `curl` / PowerShell one-liner above.

</details>

---

## Migrating from 1.x

| 1.x | 2.0 |
|---|---|
| `rootDirectory` | `input` |
| `outputFile` | `output` |
| `excludePatterns` | `exclude` |
| `includePatterns` | `include` (force-include; no longer whitelist) |
| `onlyPatterns` | `only` |
| `maximumFileSizeBytes` | `maxFileSize` |
| `maximumTotalSizeBytes` | `maxTotalSize` |
| `generatedDate` | `date` |
| `useGitignore` | `gitignore` |
| `useAnsi` | `ansi` |
| `copyToClipboard` | `copy` |
| `.fln.json` | `fln.json` (no longer loaded) |
| JSON `rootDirectory` field | `input` |
| `fln({ rootDirectory: dir })` | `fln({ input: dir })` |
| Whitelist via `-i` / `includePatterns` | `--only` / `only` in config |

Unknown legacy keys in `fln.json` are rejected with `Unknown config key`. See [CHANGELOG.md](CHANGELOG.md) for the full 2.0 breaking list.

---

## Support this project

**`fln` is free, open-source, and maintained by one developer.**

If it saves you time or improves your AI workflow:

- ⭐️ **[Star the repo](https://github.com/nesvet/fln)** — helps discoverability
- 💙 **[Support on Patreon](https://www.patreon.com/nesvet)** — keeps development going

## Contributing

PRs and issues are welcome. Local gate: `bun run verify` (mirrors CI). See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup and [`AGENTS.md`](AGENTS.md) for architecture and invariants.

## License

MIT © [Eugene Nesvetaev](https://nesvet.dev)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nesvet/fln&type=Date)](https://star-history.com/#nesvet/fln&Date)
