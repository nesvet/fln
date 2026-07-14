# Feature comparison: fln vs repomix vs code2prompt

Honest, factual comparison as of July 2026. Sources: official docs, GitHub repos, npm pages.

**Key insight:** fln and repomix are not direct competitors — they have different philosophies. fln is a **context compiler** with diagnostics (`why`, `doctor`, `plan`, `diff`, `mcp`); repomix is a **feature-rich packer**. They overlap in "flatten → one file" but diverge in approach.

## Philosophy

| | fln | repomix | code2prompt |
|---|---|---|---|
| **Tagline** | Local, explainable context compiler | Pack your codebase into AI-friendly formats | Generate LLM prompts from your codebase |
| **Core idea** | Analyze → plan → emit, with diagnostics | Pack everything with smart filtering | Template-based prompt generation |
| **Language** | TypeScript (Bun + Node) | TypeScript (Node 22+) | Rust |
| **Runtime** | Bun / Node ≥22 / **native binary** | Node 22+ | Native binary |
| **npm** | `fln` | `repomix` | `code2prompt-rs` (cargo/brew/pip) |

## Feature matrix

### Core

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Flatten to single file | ✅ md, json | ✅ xml, md, json, plain | ✅ customizable templates |
| Directory tree in output | ✅ | ✅ | ✅ |
| Token counting | ✅ estimate, gpt-4, gpt-4o, gpt-5, claude, gemini | ✅ o200k_base (gpt-tokenizer) | ✅ |
| `.gitignore` aware | ✅ | ✅ + `.ignore` + `.repomixignore` | ✅ |
| Binary file detection | ✅ magic bytes | ✅ | ✅ |
| Project metadata detection | ✅ 7 manifests | ✅ monorepo-aware | ❌ |
| Deterministic output | ✅ | ✅ | ✅ |
| Config file | ✅ `fln.json` + schema | ✅ `repomix.config.json` | ✅ |

### Diagnostics — fln's unique layer

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| `why <path>` — explain include/exclude | ✅ **unique** | ❌ | ❌ |
| `doctor` — preflight diagnostics | ✅ **unique** | ❌ | ❌ |
| `plan` — context plan with fidelity | ✅ **unique** | ❌ | ❌ |
| `diff` — snapshot comparison | ✅ **unique** | ❌ | ❌ |
| `inspect` — scan-only API | ✅ | ❌ | ❌ |
| Security detail on FileNode | ✅ `securityDetail` | ❌ | ❌ |
| TOCTOU detection | ✅ warn on mismatch (`--strict-toctou` throws) | ❌ | ❌ |

### MCP & agent integration

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| MCP server | ✅ `fln mcp` | ✅ `--mcp` | ✅ |
| MCP tools | `fln_snapshot`, `fln_plan`, `fln_diff`, `fln_why`, `fln_doctor` (5) + resources | (similar) | (similar) |
| `fln_why` / `fln_doctor` as MCP tools (structured JSON) | ✅ **unique** | ❌ | ❌ |
| AGENTS.md support | ✅ (in repo) | ✅ (in repo) | ✅ (in repo) |

### Filtering & selection

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Exclude patterns | ✅ + `!` negation | ✅ | ✅ |
| Force-include (`-i`) | ✅ bypasses ignore + hidden | ✅ via `--include` | ✅ |
| Whitelist (`--only`) | ✅ | ✅ `--include` | ✅ |
| `--ext` extension filter | ✅ | ✅ via `--include` | ✅ |
| `--relevant` (import graph) | ✅ **unique** — seed files → reachable set | ❌ | ❌ |
| `--since` git diff | ✅ | ✅ `--include-diffs` | ❌ |
| `--diff-hunks` (unified diff) | ✅ | ✅ `--include-diffs` | ❌ |
| Git logs | ❌ | ✅ `--include-logs` | ❌ |
| `--stdin` (pipe file list) | ✅ force-include + prune to set | ✅ | ❌ |
| Hidden files | ✅ `--include-hidden` | ✅ | ✅ |
| Per-file inclusion levels | ❌ | ✅ `output.patterns` (v1.16) | ❌ |

### Security

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Sensitive path patterns | ✅ 28+ patterns | ✅ Secretlint | ✅ basic |
| Known secret detection | ✅ AWS, Google, GitHub, Stripe, Slack, PEM | ✅ Secretlint | ❌ |
| Entropy detection | ✅ Shannon entropy on file headers | ✅ Secretlint | ❌ |
| `securityDetail` on skip | ✅ explains why | ❌ | ❌ |
| Force-include bypasses ignore | ✅ but **never** embeds secrets | ✅ | ✅ |

### Compression & token reduction

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Block comment stripping | ✅ string-aware regex | ✅ `--remove-comments` | ❌ |
| Signature extraction | ✅ custom line-based (JS/TS/Python/Go/Rust/Java/C) | ✅ tree-sitter (~70%) | ❌ |
| `--compress` (per-file) | ✅ where extractor exists, else full content | ✅ tree-sitter | ❌ |
| `--outline` mode | ✅ **unique** — signatures-only for every file | ❌ | ❌ |
| Token budget | ✅ `--max-tokens` + priority | ✅ `--token-budget` | ❌ |
| Size cap | ✅ `--max-total-size` | ✅ `--split-output` | ❌ |
| Output splitting | ✅ `--output-split` (md only) | ✅ `--split-output` | ❌ |

### Output & delivery

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Markdown output | ✅ | ✅ | ✅ |
| JSON output | ✅ | ✅ | ❌ |
| `omittedFiles` in JSON (capped, all reasons) | ✅ **unique** | ❌ | ❌ |
| XML output | ❌ | ✅ (default) | ❌ |
| Plain text output | ❌ | ✅ | ✅ |
| Clipboard (`--copy`) | ✅ | ✅ | ❌ |
| stdout (`--stdout`) | ✅ | ✅ | ✅ |
| Banner/footer | ✅ inline + file | ✅ `--header-text` + instruction file | ✅ templates |
| Reproducible date | ✅ `--date` | ❌ | ❌ |

### Developer experience

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Native binary (no Node) | ✅ `bun build --compile` | ❌ Node required | ✅ Rust |
| Shell completions | ✅ bash, zsh, fish | ❌ | ❌ |
| `fln init` (config template) | ✅ + JSON Schema IntelliSense | ✅ `--init` | ❌ |
| JSON Schema for config | ✅ hosted + vendored | ❌ | ❌ |
| JSON Schema for output | ✅ `schema/fln-output.json` | ❌ | ❌ |
| Watch mode | ❌ | ✅ `--watch` | ❌ |
| Remote repos | ❌ | ✅ `--remote` | ❌ |
| Browser extension | ❌ | ✅ Chrome + Firefox | ❌ |
| Website | ❌ | ✅ repomix.com | ❌ |
| Discord | ❌ | ✅ | ❌ |

### Performance

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Single-pass I/O | ✅ scan=metadata, render=content | ❌ reads during scan | ❌ |
| Streaming render | ✅ atomic write + stream | ✅ | ✅ |
| Parallel scan | ✅ `p-limit` concurrency | ✅ | ✅ |
| Token counter | `gpt-tokenizer` (cl100k_base / o200k_base) | `gpt-tokenizer` (pure JS, faster) | — |
| Token count cache | ✅ disk cache for diff token counts | ✅ content-addressed disk cache | ❌ |
| Benchmark baselines | ✅ CI regression gate (+10%) | ❌ | ❌ |

### API & SDK

| Feature | fln | repomix | code2prompt |
|---|---|---|---|
| Namespace API | ✅ `fln()`, `.inspect()`, `.explain()`, `.doctor()`, `.plan()`, `.diff()`, `.mcp()` | ❌ CLI-first | ✅ Python SDK |
| `FlnError` with stable codes | ✅ | ❌ | ❌ |
| Progress callback | ✅ | ❌ | ❌ |
| TypeScript types | ✅ full | ❌ | ❌ |
| `api-discipline` invariant | ✅ enforced in CI | ❌ | ❌ |

### Community & maturity

| | fln | repomix | code2prompt |
|---|---|---|---|
| GitHub stars | — | 26.8k | 7.5k |
| npm downloads/month | ~69 | ~290k | negligible (cargo/brew) |
| First release | 2026-02-09 | 2024 | 2024 |
| Sponsors | Patreon | Warp, CodeRabbit | — |
| License | MIT | MIT | MIT |

## When to use what

### Use fln if you want:

- **CI context guards** with token budgeting and `--strict-limits`
- **Agent context-server** via MCP (`fln mcp` with `fln_why` diagnostics)
- **Explainability** — "why was this file excluded?" (`fln why`)
- **Context planning** — `fln plan` shows what fits the budget and at what fidelity
- **Snapshot diffing** — `fln diff` compares two snapshots (added/removed/changed + token delta)
- **Preflight diagnostics** before flattening (`fln doctor`)
- **Reproducible snapshots** — deterministic output, fixed `--date`
- **Local-first Q&A** — `fln --stdout | llm`, no network, no embeddings
- **Composable pipelines** — `--stdin` pipes a file list from `git ls-files`, `rg`, `fd`, `git diff --name-only`
- **Native binary** — no Node.js runtime required
- **Namespace API** — programmatic integration with stable error codes

### Use repomix if you want:

- **One-shot web-chat paste** with the most features
- **Tree-sitter compression** (AST-based signature extraction, ~70% token reduction)
- **Remote repos** — flatten any public GitHub repo without cloning
- **Watch mode** — live snapshot on file changes
- **Git logs** in output (`--include-logs`)
- **Per-file inclusion levels** (`output.patterns`)
- **Browser extension** or website (repomix.com)
- **Community** — Discord, more downloads, more contributors

### Use Cursor `@codebase` / Cody / Augment if you want:

- **IDE-embedded retrieval** on repos larger than context window
- **Semantic search** — embeddings-based, not static
- **Real-time** — no manual flatten step

### They're not mutually exclusive

fln and repomix both produce paste-ready files. fln adds the compiler/diagnostics layer. Cursor handles repos that don't fit in any context window. Use the right tool for the job.

### Honest caveats on fln's signature extraction

fln's `--compress` / `--outline` use a **custom line-based regex extractor** (imports, type/function/class signatures, docstrings), not a Tree-sitter AST. This is faster and dependency-free, but less precise than repomix's Tree-sitter approach — it can miss language-specific constructs or include false positives in unusual syntax. Tree-sitter remains a possible future opt-in; the line-based extractor was chosen to keep fln local-first and binary-friendly (no native grammars).

---

*Update when features ship or competitors release notable updates.*
