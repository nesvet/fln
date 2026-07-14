# Performance benchmarks

Regression benchmarks for `fln` scan/render I/O. Fixtures are generated at runtime (not committed).

## Profiles

| Profile | Files | Avg size |
|---------|-------|----------|
| `small` | 500 | 2 KB |
| `medium` | 5000 | 4 KB |
| `large` | 1000 | 500 KB |

## Scenarios (medium profile in CI)

| Scenario | Command | Baseline key |
|----------|---------|--------------|
| `dry-run` | `fln . --dry-run` | `medium-dry-run-ms` |
| `full` | `fln . -o /dev/null --overwrite` | `medium-full-ms` |
| `no-contents` | `fln . -o /dev/null --no-contents` | (report only) |

`--annotate-tree` and `--collect-todo` add render-phase work but are not part of the CI regression gate.

## Local run

```bash
bun run build:npm
bun run bench              # all profiles, informational
bun run bench --profile medium
```

## CI gate

- Job `bench` on `ubuntu-latest` runs `bun run bench:ci`.
- Platform: **linux-x64 only** (other platforms skip the gate with exit 0).
- Tolerance: median time must not exceed baseline **+10%**.

## Updating baselines

On **linux-x64** (Ubuntu CI runner, Linux VM, or `act`):

```bash
bun run build:npm
bun run bench --profile medium --update-baselines
```

On Apple Silicon, use Docker with `linux/amd64` so `process.arch` is `x64`:

```bash
docker run --rm --platform linux/amd64 -v "$PWD":/work -w /work oven/bun:1.3.14 \
  bash -c "bun install --frozen-lockfile && bun run build:npm && bun run bench --profile medium --update-baselines"
```

Commit `benchmarks/baselines.json` with a short note in the PR when the change is intentional (optimization or expected regression from a trade-off).

Do not inflate baselines to hide regressions; only update after verifying the new median on linux-x64.
