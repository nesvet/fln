# Contributing to flatr

Thanks for considering contributing! flatr is maintained by one developer, so community help is valuable.

## Quick start

1. Fork and clone the repo
2. Install dependencies:
   ```bash
   bun install  # or npm install
   ```
3. Make your changes
4. Run checks:
   ```bash
   bun test
   bun run lint
   bun run typecheck
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

- `bun run dev` — run CLI locally without building
- `bun run build` — compile standalone binary
- `bun run build:npm` — build for npm package

## Code style

- Follow existing formatting (tabs, double quotes, camelCase)
- Write clear, explicit names over abbreviations
- Add tests for new features or bug fixes
- Keep PRs focused on a single concern

## After your PR

PRs are usually reviewed within a few days. If you don't hear back within a week, feel free to ping.

---

**Using flatr in production?** Consider sponsoring on [Patreon](https://www.patreon.com/nesvet) to support long-term maintenance.
