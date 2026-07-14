# Contributing to fln

Thanks for considering contributing! fln is maintained by one developer, so community help is valuable.

Architecture and invariants (namespace API, single-pass I/O, `FlnError`, CLI vs API): see [`AGENTS.md`](AGENTS.md).

## Quick start

1. Fork and clone the repo
2. Install dependencies:
   ```bash
   bun install  # or npm install
   ```
3. Make your changes
4. Run checks — `bun run verify` is the full CI verify job (examples + demo-plan drift, lint, api-discipline, typecheck, build:npm, check:dist, tests, binary):
   ```bash
   bun run verify
   ```
   Or step by step (`pretest` runs `generate:version` so `src/version.ts` exists):
   ```bash
   bun test
   bun run lint        # biome: lint + format
   bun run typecheck
   bun run check:api-discipline
   bun run check:examples
   bun run check:demo-plan
   ```
5. Open a PR

## What to contribute

**Good first contributions:**
- Documentation improvements
- Bug fixes with clear reproduction steps
- Test coverage improvements
- Performance optimizations

**Feature ideas:** Open an issue first to discuss. This saves time if the feature doesn't align with the project's direction.

## Development tips

- `bun run generate:version` — writes `src/version.ts` (gitignored; also via `pretest` / `prebuild`)
- `bun run dev` — run CLI locally without building
- `bun run build` — compile standalone binary into `./fln`
- `bun run build:npm` — wipe `dist/` and build the npm package
- `bun run check:dist` — assert every emit under `dist/` has a matching `src/**/*.ts`
- `bun run install:user` — install binary to `~/.local/bin/fln` (no sudo)

## Regenerating demo GIF

The README hero GIF is generated with [VHS](https://github.com/charmbracelet/vhs). You need `vhs`, `ffmpeg`, and `ttyd` on your `PATH`.

```bash
bun run build          # produces ./fln in the repo root
bun run record:demo    # or: ./scripts/record-demo.sh
```

The script prefers the repo-local `./fln` binary (prepends the repo root to `PATH`), sets `FLN_NO_SPONSOR=1` for the recording session (not shown in the tape), and runs `vhs assets/demo.tape`. Edit [`assets/demo.tape`](assets/demo.tape) to change the scenario; commit both the tape and [`assets/demo.gif`](assets/demo.gif).

## Performance

Changes that affect scan, render, or file I/O should be validated with benchmarks:

```bash
bun run build:npm
bun run bench
```

Pull requests that intentionally change performance must either keep `bun run bench:ci` green on linux-x64 or update `benchmarks/baselines.json` with a short justification (see [benchmarks/README.md](benchmarks/README.md)).

## Public API

Operations are namespace-only: `fln()`, `fln.inspect()`, `fln.explain()`, `fln.doctor()`, `fln.plan()`, `fln.diff()`, `fln.mcp()`. Do not add standalone exports for those operations.

Standalone exports (allowed): `VERSION`, `FlnError` / `flnError` / `toFlnFailureJson`, `toFlnWhyJson`, `toFlnDoctorJson`, `toFlnPlanJson`, `toFlnDiffJson`, `formatPlanText`, `formatDoctorText`, `formatDiffText`, and types.

## Code style

- Follow existing formatting (tabs, double quotes, camelCase)
- Write clear, explicit names over abbreviations
- Add tests for new features or bug fixes
- Keep PRs focused on a single concern

## After your PR

PRs are usually reviewed within a few days. If you don't hear back within a week, feel free to ping.

---

**Using `fln` in production?** Consider sponsoring on [Patreon](https://www.patreon.com/nesvet) to support long-term maintenance.
