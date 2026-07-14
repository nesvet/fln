#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

max_mebibytes=5

# Prefer repo-local binary, then user install — never require sudo /usr/local/bin.
if [[ -x "$root/fln" ]]; then
	export PATH="$root:${PATH}"
elif [[ -x "${HOME}/.local/bin/fln" ]]; then
	export PATH="${HOME}/.local/bin:${PATH}"
fi

export FLN_NO_SPONSOR=1
export TERM=xterm-256color
export COLORTERM=truecolor
export FORCE_COLOR=1
export LESS=-R

if ! command -v fln >/dev/null; then
	echo "fln not found. Build first: bun run build  (produces ./fln)" >&2
	echo "Or: bun run install:user  (installs to ~/.local/bin/fln)" >&2
	exit 1
fi

echo "→ Using fln $(fln --version) at $(command -v fln)"

if ! command -v vhs >/dev/null; then
	echo "vhs not found (brew install vhs)" >&2
	exit 1
fi

rm -f examples/ts-app/snapshot.md

echo "→ Recording assets/demo.gif…"
if ! vhs assets/demo.tape; then
	echo "→ Retrying VHS (ttyd warm-up)…"
	sleep 2
	vhs assets/demo.tape
fi

size_bytes=$(wc -c < assets/demo.gif | tr -d " ")
max_bytes=$((max_mebibytes * 1024 * 1024))
if (( size_bytes > max_bytes )); then
	size_mib=$((size_bytes * 100 / 1024 / 1024))
	echo "Warning: assets/demo.gif is ${size_mib}/100 MiB (target ≤ ${max_mebibytes} MiB). Consider lowering Framerate or Width in assets/demo.tape." >&2
fi

echo "✓ Done: assets/demo.gif ($(du -h assets/demo.gif | cut -f1))"
rm -f examples/ts-app/snapshot.md
