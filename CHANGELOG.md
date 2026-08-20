# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.1] - 2026-08-21

Standalone binaries are compiled with Bun 1.4. Toolchain and dependencies catch up to that runtime.

### Changed

- Compile and CI pin **Bun 1.4.0**; `bun.lock` is `lockfileVersion` 2
- **TypeScript 7.0.2**, `@nesvet/biome-config` 2, `gpt-tokenizer` 4, MCP SDK 1.30

## [2.0.0] - 2026-07-14

Initial release of fln 2.x on npm `latest` — fln becomes a **local, explainable context compiler** for AI coding agents (analyze → plan → emit, with diagnostics).

### Added

#### CLI

- **`fln doctor [dir]`** — preflight scan without writing output (config, git, scan stats, token estimate, extension breakdown; `--format text|json`; exit 0/1/2)
- **`fln why <path>`** — explains why a path is included or excluded (`--format text|json` for agents and CI)
- **`fln plan [dir]`** — plan context for a token budget: fidelity per file (`full` / `compressed` / `outline` / `omit`), projected tokens (`--budget`, `--relevant`, `--format text|json`)
- **`fln diff <before> <after>`** — diff two snapshots: added, removed, changed (content-hash), tree-delta, fidelity changes (`--format text|json`); `--since <ref>` (ref vs working tree) and `fln diff <ref> <ref>` (two git refs via `git archive`)
- **`fln mcp [dir]`** — start MCP server (stdio) for AI agent integration
- **`--copy`** — copy flatten output to the system clipboard (32 MiB default cap; `FLN_COPY_MAX_BYTES` to override; `CLIPBOARD_*` errors)
- **`--only`** — whitelist mode (only matching files)
- **`--ignore-config`** — skip `fln.json`; use defaults and explicit CLI flags only
- **`--no-local-state`** — do not update `~/.config/fln/usage.json` on this run
- **Token and size limits** — `--max-tokens`, `--max-content-tokens`, `--token-model` (`estimate`, `gpt-4`, `gpt-4o`, `gpt-5`, `claude`, `gemini`), `--strict-limits` (exit 3 on exceed)
- **`--compress`** — signature extraction (imports, types, function signatures; bodies omitted; full content where no extractor)
- **`--outline`** — signatures only — no implementations (implies `contents`)
- **`--relevant <path>`** — only include files transitively imported by seed paths (repeatable; TS/JS/Py/Go/Rust/Java/C) — local-first RAG without embeddings
- **`--stdin`** — read file paths from stdin; force-includes them (bypasses ignore + hidden, like `-i`) and prunes the tree to exactly that set (works with `fln` and `fln plan`; security patterns still apply)
- **`--budget <n>`** — alias for `--max-tokens` on `fln plan` (matches the `fln.plan({ budget })` API)
- **`--strict-toctou`** — throw `TOCTOU` when a file changed between scan and render (default: warn)
- **`--diff-hunks`** — with `--since`: embed unified diff hunks instead of full files (batched single `git diff` call)
- **`--encoding`** — `auto`, `utf8`, or `latin1` for text files
- **`--output-split`** — max output parts when split by limits
- **Shell completions** — bash, zsh, fish, and PowerShell (`completions/` in the npm package)
- **`fln upgrade`** — download and install the latest standalone binary from GitHub Releases (sha256 verified; optional cosign when available)
- **`--security-check strict`** — extended secret patterns, lower entropy threshold, deeper header scan (4 KiB)
- **`doctor --recommend-budget <n>`** — suggest exclude patterns to fit a token budget
- **MCP `--http` / `--port`** — Streamable HTTP transport for `fln mcp`
- **`fln diff --diff-hunks`** — intra-file unified hunks for changed files between snapshots
- **`--annotate-tree <tokens|lines|size>`** — annotate directory tree with counts (`tokens`/`lines` defer tree to end; single-pass preserved)
- **`--collect-todo`** — collect TODO/FIXME/HACK/XXX/NOTE/BUG/WARN markers into a dedicated section (render-phase)
- **Release signing** — cosign keyless signatures + SPDX SBOM on GitHub Release assets (CI-only)
- **`llms.txt`** — LLM-oriented site index at [fln.nesvet.dev/llms.txt](https://fln.nesvet.dev/llms.txt)

#### API

- Namespace API: **`fln()`**, **`fln.inspect()`**, **`fln.explain()`**, **`fln.doctor()`**, **`fln.plan()`**, **`fln.diff()`**, **`fln.mcp()`**
- **`fln init`** — writes `fln.json` and `.mcp.json` (Cursor/Claude MCP config template)
- **`fln.inspect(options)`** — scan-only; returns `FlnInspectResult` (`root`, `stats`) without writing output
- **`fln.explain()`** / **`toFlnWhyJson`** — same path decision logic as `fln why`
- **`fln.doctor()`** / **`toFlnDoctorJson`** / **`formatDoctorText`** — programmatic preflight reports
- **`fln.plan()`** / **`toFlnPlanJson`** / **`formatPlanText`** — budget planning with fidelity per file and import-graph retrieval
- **`fln.diff()`** / **`toFlnDiffJson`** / **`formatDiffText`** — snapshot comparison with content-hash, tree-delta, git-ref mode
- **`fln.mcp()`** — MCP server (stdio) for AI agent integration
- **`stdinPaths`** option on `FlnOptions` / `FlnPlanOptions` — programmatic equivalent of `--stdin` (force-include + prune to set)
- **`VERSION`** export from package entry
- Public types: `FileNode`, `SkipReason`, `ScanStats`, `OmittedFile`, `FlnInspectResult`, `FlnDoctorOptions`, `FlnExplainOptions`, `FlnPlanOptions`, `FlnPlan`, `FlnDiffOptions`, `FlnDiff`, `FlnMcpOptions`, `PathDecision`, …

#### Errors and exit codes

- **`FlnError`** with stable `code`, optional `hint` and `path`; **`toFlnFailureJson`** for machine-readable errors
- CLI stderr format: `fln: [CODE] message` (optional `Hint:` line)
- Exit **2** — `NO_FILES_INCLUDED`; exit **3** — `LIMIT_EXCEEDED` with `--strict-limits`
- New codes: **`TOCTOU`** (file changed between scan and render, with `--strict-toctou`), **`UPGRADE_FAILED`** (`fln upgrade` network/install failures)

#### MCP server

- **5 tools**: `fln_snapshot` (flatten), `fln_plan` (budget), `fln_diff` (compare snapshots), `fln_why` (explain decisions, structured JSON), `fln_doctor` (preflight, structured JSON)
- **Resources**: `fln_file://{path}` (read a file from the input dir), `fln_snapshot://{name}` (generate a snapshot on-the-fly)
- Path traversal prevention on `fln_file://`; size limits on `fln_snapshot://`

#### Filtering and security

- **`only`** in `fln.json` and **`--only`** on CLI — whitelist (replaces 1.x “include-only project” behavior)
- **`-i` / `include`** — force-include (additive; bypasses ignore and hidden dotfiles)
- **`--stdin` / `stdinPaths`** — force-include + prune to the piped set (bypasses ignore + hidden; security patterns still apply; paths outside input are dropped)
- Exclude **`!`** — un-ignore after `.gitignore` and built-in ignores (e.g. `*.log` + `!important.log`)
- **`securityPatterns`** — built-in and configurable globs; sensitive paths get `skipReason: security` (detected content never embedded, even with force `-i`)
- **TOCTOU detection** — `scanMtimeMs`/`scanSize` checked at render; warns on mismatch (or throws `TOCTOU` with `--strict-toctou`)

#### Retrieval and compression

- **Import-graph retrieval** — `--relevant <seed>` includes only files transitively imported by seed paths (TS/JS/Py/Go/Rust/Java/C import parsing; ESM `.js` specifiers resolve to `.ts`/`.tsx` sources; no embeddings, no server)
- **Signature extraction** — `--compress` (signatures where an extractor exists, full content elsewhere) and `--outline` (signatures only, no bodies); custom line-based extractor (zero dependencies)
- **Diff-hunks batching** — single batched `git diff` call for `--diff-hunks` (instead of one `git` subprocess per file)

#### Output

- JSON **`schemaVersion: 2`** with `input` (no duplicate `rootDirectory`); top-level **`root`** (`FileNode` tree) separate from **`options.tree`** (boolean flag)
- **JSON Schema** for flatten output — [schema/fln-output.json](schema/fln-output.json) (`https://fln.nesvet.dev/schema/output`)
- **JSON Schema** for doctor output — [schema/fln-doctor.json](schema/fln-doctor.json) (`https://fln.nesvet.dev/schema/doctor`); `toFlnDoctorJson` emits `$schema`
- **`stats.omittedByReason`** — counts per skip reason after render
- **`omittedFiles`** in JSON — flat, size-sorted list of omitted files (`{path, reason, size}`) capped at 1000, with `omittedFilesTotal` and `omittedFilesTruncated`; present only when files were omitted (single-pass I/O preserved — sizes from scan metadata, no extra content read)
- **File priority** — README/config before tests when `--max-tokens` omits files
- **Streaming at render** — force-included files larger than `--max-file-size` stay in the tree; content streamed instead of loaded during scan
- **Encoding-aware fence sampling** — BOM/UTF-16/latin1 for backtick-safe Markdown on large files

#### Tooling and docs

- **Performance benchmarks** and CI regression gate ([benchmarks/README.md](benchmarks/README.md))
- **Node.js ≥22** — `engines.node`; CI matrix on Node 22 and 24
- **Config file** — `fln.json` (visible, first-class); `.fln.json` is no longer loaded
- **npm Trusted Publishing** — OIDC + provenance from `publish.yaml` (no long-lived `NPM_TOKEN`)
- **Secret detection** — Azure storage keys, GitLab PATs, JWT tokens (in addition to AWS/Google/GitHub/Stripe/Slack/PEM)
- **Privacy** — README and SECURITY clarify local `usage.json` vs zero network telemetry; `fln doctor` reports sponsor tracking status
- README demo GIF and expanded 2.x CLI/API documentation

### Changed

#### Breaking

- **API/config booleans** — `tree` and `contents` (positive defaults: `true`); CLI opt-out: `--no-tree`, `--no-contents`
- **JSON flatten output** — top-level **`root`** (`FileNode` tree); **`options.tree`** / **`options.contents`** are boolean flags (avoids name collision)
- **`FlnDoctorOptions`** — no `noLocalState` / `noSponsorMessage` (CLI-only; programmatic `fln.doctor()` uses file/env sponsor state)
- **`fln.json` validation** — unknown keys → `INVALID_CONFIG` (`Unknown config key "…"`); no legacy alias support; `.fln.json` is no longer loaded
- **`validateCopyOptions`** — renamed from `validateCopyToClipboardOptions` (CLI/pipeline internal; not a public `index` export)
- Removed deprecated 1.x names: `rootDirectory`, `outputFile`, `maximumFileSizeBytes`, `maximumTotalSizeBytes`, `generatedDate`, `useGitignore`, `useAnsi`, CLI `--generated-date`
- **`FlnResult.files`** removed — use **`filesIncluded`**; **`filesScanned`** on result where applicable
- **`FlnResult._root`** removed — use **`fln.inspect()`** for file tree and `skipReason`
- **`-i` / `include`** no longer whitelist the project — use **`--only`** or **`only`** in config
- Removed **`restrictToIncludePatterns`** API flag
- **`ScanStats.files`** removed — use **`filesScanned`** and **`filesIncluded`**
- **`fln()`** and **`fln.inspect()`** throw **`FlnError`** instead of generic `Error` for common failures (match on **`code`**, not exact `message`)
- npm package operations are **namespace-only** (`fln.inspect` / `fln.explain` / `fln.doctor` / `fln.plan` / `fln.diff` / `fln.mcp`); serializers (`toFln*Json`, `format*Text`), `FlnError`, `VERSION`, and types remain standalone exports
- JSON output: **`rootDirectory`** field removed; use **`input`** only
- **`tokenModel`** — `"gpt-5"` (alias of `o200k_base`), `"claude"` and `"gemini"` (char/token heuristic estimators) added

#### Other

- **Invalid `tokenModel`** — any value outside `estimate`, `gpt-4`, `gpt-4o`, `gpt-5`, `claude`, `gemini` fails with `INVALID_CONFIG` (no special-case messages)

- **Token counting** — `js-tiktoken` replaced with `gpt-tokenizer` (pure JS BPE); content-addressed disk cache for snapshot diff token counts
- **Markdown snapshot header** — includes `tokenModel` for accurate `fln diff` token deltas
- **`fln doctor`** — warns `FILES_CHANGED_DURING_PREFLIGHT` when files change during preflight scan
- **`fln why`** — entropy and secret-pattern details in `detail` field
- Force-include auto-allows hidden dotfiles (no `--include-hidden` required for `-i .env`)
- JSON field order: **`stats`** (including `omittedByReason`) after **`files`** array
- **`npm install fln`** publishes to **`latest`** (2.x pre-releases used `fln@next`)
- CLI uses one scan per flatten run (`runFlnPipeline` + optional `writeOutput`)

### Fixed

- `build:npm` wipes `dist/` before emit; `check:dist` + `prepack` keep npm tarballs free of orphan modules after source moves/deletes
- Release tags, `fln upgrade`, and Homebrew formula URLs use version identifiers **without** a `v` prefix (matches historical tags `1.x.x`)
- Plan/diff text headings use cwd-relative paths (portable `assets/demo-plan.md` / CI)
- Public `index` no longer re-exports operation functions (`plan` / `doctor` / `diff` / `mcp`) — use `fln.*`; serializers stay standalone
- Contributor onboarding: `pretest` generates `version.ts`; `bun run verify` is the full CI verify job (examples + demo-plan drift, lint, api-discipline, typecheck, build:npm, check:dist, tests, binary)
- Evidence tests: portable `# Context Plan: .`, invalid `maxTokens` → `FlnError`, MCP resource `FlnError` paths, `check:api-discipline` smoke
- `examples/ts-app`: `.env.example` wired to `process.env.API_KEY` (key never printed); README documents security-demo fixture
- MCP HTTP smoke via `startMcpHttpServer` (ephemeral port)
- AGENTS.md verify pipeline matches `bun run verify` (includes examples + demo-plan drift checks)
- Evidence test: `examples/ts-app` stdout never leaks `API_KEY` value

### Removed

- Deprecated **`files`** alias on `FlnResult`
- **`FileCache`** and **`fileCacheMaxBytes`** (replaced by single-pass I/O and render-time streaming)
- Standalone npm exports: **`inspect`**, **`explain`**, **`explainPath`**, **`formatPathDecision`**, **`buildDoctorReport`**, **`resolveDoctorFromCli`**

## [1.2.0] - 2026-02-26

### Removed (Breaking)

- Public API reduced to `fln`, `FlnOptions`, `FlnResult`, `LogLevel`, `ProgressCallback`. Removed exports: `scanTree`, `writeOutput`, `renderTree`, `IgnoreMatcher`, `parseByteSize`, `formatByteSize`, `formatTokenCount`, `collectExtensionStats`, `collectProcessedFiles`, core types (`FileNode`, `ScanResult`, etc.), `VERSION`.

### Added

- New option names: `input` (replaces `rootDirectory`), `output` (replaces `outputFile`), `maxFileSize`, `maxTotalSize`, `date`, `gitignore`, `ansi` (API, config, CLI)
- JSON output now includes `input` field (in addition to `rootDirectory` for backward compatibility)
- `bannerFile` — path to file whose contents are prepended to output (file excluded from tree)
- `footerFile` — path to file whose contents are appended to output (file excluded from tree)
- New CLI features: `fln init`, `--stdout`, `--ext`, `--since`
- New CLI flags: `--date`, `--banner-file`, `--footer-file`
- Config schema and `fln init` template (`$schema`) for `.fln.json`

### Changed

- JSON output `options` object now uses `maxFileSize`, `maxTotalSize`, `gitignore` (old names deprecated)
- Output now supports stdout target (`-`) and auto-adds extension (`.md`/`.json`) when missing
- Banner/footer content now combines inline text with file-based content
- Project metadata detection now also supports `pom.xml`

### Fixed

- `excludePatterns` and `includePatterns` now normalize leading `./` and safely ignore paths resolving outside input (for example, `../...`)
- Windows ARM64 binary release target corrected in release workflow

### Deprecated

- `rootDirectory` — use `input` instead. Will be removed in 2.0.
- `outputFile` — use `output` instead (in API options and `.fln.json`). Will be removed in 2.0.
- `maximumFileSizeBytes` — use `maxFileSize` instead. Will be removed in 2.0.
- `maximumTotalSizeBytes` — use `maxTotalSize` instead. Will be removed in 2.0.
- `generatedDate` — use `date` instead. Will be removed in 2.0.
- `useGitignore` — use `gitignore` instead. Will be removed in 2.0.
- `useAnsi` — use `ansi` instead. Will be removed in 2.0.
- CLI `--generated-date` — use `--date` instead. Will be removed in 2.0.
- JSON output field `rootDirectory` — use `input` instead. Will be removed in 2.0.

## [1.1.3] - 2026-02-12

### Fixed

- npx run (Node ESM compatibility via explicit .js imports)
- Native Windows ARM64 build support (release workflow and install script)

### Changed

- Show full install path in Windows install script (instead of `~` shorthand)
- Replace bare path imports with explicit `index.js` for Node ESM
- Run tests after npm build in CI

## [1.1.2] - 2026-02-11

### Added

- Colored install script output with FLN_SILENT to disable
- Install script validation (version, directory, file size limits)
- PATH detection and shell-specific instructions in install scripts

### Fixed

- Correct gitignore check for directories in scanTree (trailing slash)
- Extend NO_COLOR support to any non-empty value per spec

### Changed

- Replace TypeScript path aliases with relative imports
- CLI entry point moved from `main.ts` to `index.ts`
- Improved error handling with optional DEBUG stack trace
- Install URLs updated to fln.nesvet.dev
- Add `pom.xml` to manifest list in docs

## [1.1.1] - 2026-02-10

### Added

- API option to overwrite existing output files

### Fixed

- Corrected markdown line break for generated date

## [1.0.0] - 2026-02-09

### Added

- CLI tool to flatten codebases into single LLM-ready files
- Markdown and JSON output formats
- JavaScript/TypeScript API for programmatic usage
- Configuration file support (`.fln.json`)
- Gitignore-aware scanning with customizable excludes and includes
- Fast parallel file processing
- Binary file detection and filtering
- Configurable size limits (per-file and total)
- Smart file ordering for optimal LLM comprehension
- Auto-detection and skipping of fln-generated files
- Dry-run mode for previewing output
- Project metadata detection (`package.json`/`Cargo.toml`/`pyproject.toml`/`vcpkg.json`/`go.mod`/`CMakeLists.txt`)
- Deterministic output naming with version detection
- Token counting for LLM context estimation
- Progress tracking with callback API
- Custom banner and footer support
- Quiet and verbose logging modes
- Cross-platform shell installers with SHA256 verification (macOS, Linux, Windows)
- Comprehensive test suite

[Unreleased]: https://github.com/nesvet/fln/compare/2.0.1...HEAD
[2.0.1]: https://github.com/nesvet/fln/compare/2.0.0...2.0.1
[2.0.0]: https://github.com/nesvet/fln/compare/1.2.0...2.0.0
[1.2.0]: https://github.com/nesvet/fln/compare/1.1.3...1.2.0
[1.1.3]: https://github.com/nesvet/fln/compare/1.1.2...1.1.3
[1.1.2]: https://github.com/nesvet/fln/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/nesvet/fln/compare/1.0.0...1.1.1
[1.0.0]: https://github.com/nesvet/fln/releases/tag/1.0.0
