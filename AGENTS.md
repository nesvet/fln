# AGENTS.md

Guide for AI agents (and human contributors) working on the **fln** codebase.

## What fln is

fln is a **local, explainable context compiler** for AI coding agents. It analyzes a codebase, plans what to include, and emits a single AI-ready file — with diagnostics (`why`, `doctor`, `plan`). Think `tsc` for LLM context: analyze → plan → emit, all local, no embeddings, no server.

- **Language:** TypeScript (ESM-only, `"type": "module"`)
- **Runtime:** Bun (dev/build) + Node.js ≥22 (npm publish target)
- **Package manager:** Bun (`bun@1.4.0` — see `packageManager` in `package.json`)
- **Binary:** `bun build --compile` produces a standalone `fln` binary (no Node required)

## Architecture

```
src/
├── index.ts          — public entry: re-exports from api/
├── version.ts        — generated (scripts/generate-version.ts), gitignored
├── api/              — public namespace API
│   ├── fln.ts        — Object.assign(flnMain, { inspect, explain, doctor, plan, diff, mcp })
│   ├── mcp.ts        — MCP server: 5 tools + fln_file:// / fln_snapshot:// resources; stdio & --http
│   ├── pipeline.ts   — runFlnPipeline: resolve config → scan → return result
│   ├── doctor.ts     — preflight diagnostics
│   ├── explain.ts    — fln.explain() / fln_why
│   ├── flnError.ts   — FlnError with stable code + hint + path
│   └── types.ts      — FlnOptions, FlnResult, FlnInspectResult, FlnDoctorOptions
├── cli/              — CLI layer (commandLine, flags, help, output, completions)
├── config/           — fln.json loading, defaults, resolution, init template
├── core/             — scan + render engine
│   ├── scan/         — scanTree, buildFileNode, buildDirectoryNode, symlinkPolicy
│   ├── render/       — markdown.ts, json.ts, writeOutput, writer, limits, nodes
│   ├── compress.ts   — string-aware block comment stripping
│   ├── fileContent.ts— analyzeTextFileHeader, readMaxBacktickSample, decodeBuffer
│   ├── filePriority.ts— directory-aware file ordering (README/config/entry first)
│   ├── ignoreMatcher.ts— .gitignore + exclude + unignore engine
│   ├── securityMatcher.ts— path patterns + entropy/known-secret detection
│   └── types.ts      — FileNode, ScanStats, SkipReason, ScanOptions, RenderOptions
├── infra/            — clipboard, gitDiff, gitStatus, logger, outputWriter, tokenBudget, usageTracker
├── path/             — path normalization utilities
└── pattern/          — glob pattern normalization, since/only builders
```

## Invariants — do not break these

### 1. Namespace API

The npm package exposes operations only on the namespace: `fln()`, `fln.inspect()`, `fln.explain()`, `fln.doctor()`, `fln.plan()`, `fln.diff()`, `fln.mcp()`. **Do not add standalone exports** for these operations. New operations extend the namespace via `Object.assign` in `src/api/fln.ts`.

Standalone exports are allowed for **serializers, formatters, errors, and types** only: `toFln*Json`, `format*Text`, `FlnError` / `flnError` / `toFlnFailureJson`, `VERSION`, and public types.

Enforced by `bun run check:api-discipline` — (1) fails if `noTree`/`noContents`/`noGitignore`/`noAnsi` appear in non-CLI `src/` (CLI-only flag names; API uses positive booleans `tree`/`contents`/`gitignore`); (2) fails if `src/api/index.ts` re-exports operation functions (`plan` / `doctor` / `diff` / `mcp`).

### 2. Single-pass I/O

**Scan reads only metadata** (stat, 512-byte header by default or 4 KiB in `--security-check strict` for binary/generated/secret detection, 1 MB backtick sample). Both header sizes are metadata-only — not a full-file read. **Render performs the single full content read** (stream or compress path). This is what makes fln fast on large codebases — no file is fully read twice.

When adding features: if you need file content during scan, you're probably breaking this invariant. Content-dependent decisions belong in render.

**`--stdin` / `stdinPaths`** preserves this: piped paths are force-included (merged into `include` before scan, reusing the existing force-include path that applies `securityMatcher`), then the tree is pruned to exactly that set **after scan, before render** (`pruneTree` in `src/core/relevantGraph.ts`). The prune is metadata-only — no content read. **`omittedFiles`** in JSON likewise preserves this: sizes come from scan `FileNode.size` (stat metadata), collected via a post-render tree walk — no extra content read.

### 3. `FlnError` with stable codes

All user-facing errors throw `FlnError(code, message, { hint?, path? })` — not plain `Error`. Codes are stable for CI/SDK matching: `INPUT_NOT_DIRECTORY`, `NO_FILES_INCLUDED`, `INVALID_CONFIG`, `CLIPBOARD_TOO_LARGE`, `CLIPBOARD_UNAVAILABLE`, `LIMIT_EXCEEDED`, `GIT_NOT_FOUND`, `GIT_REF_INVALID`, `READ_FAILED`, `TOCTOU`, `UPGRADE_FAILED`.

### 4. `api-discipline` — CLI vs API separation

CLI-only flag names (`noTree`, `noContents`, `noGitignore`, `noAnsi`) must not appear in non-CLI `src/`. The API uses positive booleans (`tree: true`, `contents: true`). CLI maps negations to `false` in `src/cli/mapCliFlags.ts`.

## Development

```bash
bun install          # install deps
bun run dev          # run CLI locally without building
bun test             # run all tests
bun run lint         # biome check (lint + format)
bun run lint:fix     # biome check --write
bun run typecheck    # tsc --noEmit
bun run check:api-discipline  # invariant check
bun run build        # compile standalone binary
bun run build:npm            # wipe dist/ + compile npm package (tsc -p tsconfig.build.json)
bun run check:dist           # fail if dist/ has orphans (no matching src/**/*.ts)
```

### Code style

- Tabs, double quotes, camelCase
- Explicit names over abbreviations
- ESM imports with `.js` extensions (even in TS source)
- No comments unless asked
- `biome check .` must pass (enforced in CI)

### Regenerating derived files

- **Completions:** `bun run generate:completions` after changing CLI flags
- **Version:** `bun run generate:version` (auto-run in `prebuild`/`prebuild:npm`/`prepack`)
- **Examples:** `bun run generate:examples` (CI checks they're up-to-date)
- **Demo:** `bun run record:demo` (requires VHS + ffmpeg + ttyd)

## Contributor conventions

These apply to humans and agents; enforced in CI where noted.

### Tests

- Import from **`src/`**, never `dist/` — `dist/` does not exist during `tsc --noEmit` (typecheck runs before build).
- Framework: `bun:test` (`describe`, `it`, `expect`).
- Temp dirs: `mkdtemp(join(tmpdir(), "fln-<feature>-"))`.
- I/O mocks: `setFileContentTestHooks`, `setClipboardCopyRunnerForTests`, `setCopyTempDirectoryTrackerForTests`, `setCheckToctouTestHook`.

### Bun toolchain

- Keep `packageManager` in `package.json` and `bun-version` in `.github/workflows/*.yaml` (`oven-sh/setup-bun`) in sync. Current: `bun@1.4.0`.

## Versions and tags

**No `v` prefix** on canonical release identifiers: git tag `2.0.0`, GitHub Release title/tag, changelog heading. Source of truth: `package.json` → `src/version.ts` (generated). External APIs may return `v2.0.0` — strip `v` before compare or display.

## CI

`.github/workflows/ci.yaml`:
- **verify** job: same as local `bun run verify` — `generate:version` → `check:examples` → `check:demo-plan` → `lint` → `check:api-discipline` → `typecheck` → `build:npm` → `check:dist` → `test` → `build` binary
- **bench** job: `bun run bench:ci` on linux-x64 (regression gate, +10% tolerance)

`.github/workflows/release-binary.yaml`:
- **build** + **release** jobs: cross-compile 6 platform binaries, upload to GitHub Release
- **tap** job: renders `packaging/homebrew/fln.rb.template` with version + sha256 checksums, pushes `Formula/fln.rb` to [nesvet/homebrew-tap](https://github.com/nesvet/homebrew-tap) via `HOMEBREW_TAP_TOKEN`

## Packaging

`packaging/` holds distribution artifacts (not shipped in the npm package):
- `packaging/install/` — `install.sh` / `install.ps1` (served at `fln.nesvet.dev/install`)
- `packaging/homebrew/fln.rb.template` — Homebrew formula template (rendered by release CI)

Performance changes: run `bun run bench` and update `benchmarks/baselines.json` if needed.

## Key design decisions

- **Local-first:** zero network calls during flatten. Only `usage.json` (runCount) written locally. **`fln upgrade`** is the explicit exception — downloads a release binary from GitHub.
- **Security:** path patterns + entropy/known-secret detection on file header (512 B default, 4 KiB in `--security-check strict`). Detected secrets are never embedded, even with force `-i`. Not a guarantee — see SECURITY.md.
- **Deterministic:** same input → same output (stable file ordering, `--date` for reproducible builds).
- **Backtick-safe:** fence length adapts to max backtick run in file (+1 safety margin for files > 1 MB sample).
- **TOCTOU-aware:** `scanMtimeMs`/`scanSize` checked at render; warns on mismatch.
- **`--annotate-tree`:** `size` uses scan metadata (tree at top); `tokens`/`lines` accumulate during the single content read and move the tree section to the end.
- **`--collect-todo`:** render-phase scan of the same stream/read path as body output; no second file read.
- **`fln upgrade`:** sha256 required; cosign `verify-blob` when `cosign` is on PATH (soft-skip otherwise). Release binaries are cosign-signed in CI.
