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
