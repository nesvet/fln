# Security Policy

## Scope

`fln` is a command-line tool that runs locally on your machine. It:
- Reads files from your filesystem
- Writes output files locally
- Does **not** contact external services during flatten or diagnostics (`why`, `doctor`, `plan`, `diff`, `mcp`); the only network path is explicit **`fln upgrade`**
- Does NOT execute arbitrary code from your project

## Supported versions

Only the latest release receives security updates. Please upgrade to the latest version before reporting issues.

## Binary releases

Standalone binaries are published on [GitHub Releases](https://github.com/nesvet/fln/releases):

- **SHA256 checksums** (`.sha256`) — required; `fln upgrade` always verifies the archive hash before install
- **cosign signatures** (`.sig` + `.pem`) — keyless Sigstore signatures from release CI; verified when `cosign` is on PATH, otherwise skipped with a stderr notice (sha256-only install still proceeds)
- **SPDX SBOM** (`fln-<version>.sbom.spdx.json`) — software bill of materials for each release

The npm package uses [npm provenance](https://docs.npmjs.com/generating-provenance-statements) (`--provenance` in publish CI) — separate from binary signing.

Network access during normal `fln` runs is limited to **`fln upgrade`** (explicit user action). Flatten, `why`, `doctor`, `plan`, `diff`, and `mcp` do not contact external services.

## Reporting a vulnerability

**Please do NOT open public issues for security vulnerabilities.**

Instead:
1. Use [GitHub Security Advisories](https://github.com/nesvet/fln/security/advisories/new) for private reporting
2. Include:
   - Clear description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

I aim to respond within 3-5 business days and will work with you to address confirmed vulnerabilities.

## Sensitive files (`securityPatterns`)

fln skips paths that match built-in security globs (for example `.env`, `**/*.pem`, `credentials.json`) and any extra patterns in `fln.json` / `securityPatterns`.

- Skipped files appear in the directory tree with `skipReason: "security"` when they are scanned (for example via `-i .env` with `--include-hidden`, or force-include on a dotfile).
- **Force `-i` / `include` do not bypass security** — detected secrets are never embedded in output.
- Detection is pattern- and entropy-based: common formats (AWS, Google, GitHub, Stripe, Slack, Azure, GitLab, JWT, PEM) and high-entropy strings in file headers. **Not a guarantee** — review output before sharing.
- `fln why .env` reports whether a path would be included; use `--include-hidden` or `-i` to see the node in the tree without content.

## Local state files

`fln` does not phone home. On flatten runs it may write small local JSON files under `~/.config/fln/` (Windows: `%LOCALAPPDATA%\fln\`):

- **`usage.json`** — `runCount` and `lastRun` only — used for an optional in-terminal sponsor message, not sent anywhere
- **`token-count-cache.json`** — content-addressed cache for token counts (snapshot diff / tokenizer); local only, not sent anywhere
- **Opt out of usage writes for one run:** `--no-local-state`
- **Remove:** delete those files in that directory

## Security best practices

When using `fln`:
- Review exclude patterns before running on sensitive projects
- Use `--dry-run` first to preview what will be included
- Be careful when sharing generated output files (they contain your code)
- Don't commit `fln.json` config if it contains sensitive paths
