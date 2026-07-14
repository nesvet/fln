# Examples

Subfolders here are minimal sample projects in various languages, used to demonstrate `fln` output. Each subfolder has a corresponding generated snapshot `examples/<name>.md` next to it.

`examples/ts-app/.env.example` is a **fake** secret fixture (`sk-demo-not-a-real-secret`) for demos of `fln why` / security skipping — not a real credential.

The `*.md` files in this directory are produced by a script. After changing any example’s code, regenerate them from the repository root:

```bash
bun run generate:examples
```
