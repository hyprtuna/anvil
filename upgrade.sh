#!/usr/bin/env bash
set -euo pipefail

# anvil upgrader — thin Bash wrapper over the anvil CLI `upgrade` command.
# Run `./upgrade.sh --help` for the full flag list.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
anvil upgrader — rewire Anvil against the current source tree

Usage:
  ./upgrade.sh              Rebuild + re-apply every wired target against this clone
  ./upgrade.sh -h, --help   Show this help and exit

What it does:
  1. Rebuilds dist/ from src/ if needed (via bun or npm).
  2. Runs `anvil upgrade` — diffs ~/.anvil and every wired adapter against the
     current source tree and applies the minimal changes to converge.

Notes:
  - Works only from a source checkout (this repo). For installed runs use
    `anvil upgrade` directly.
  - Preserves every target you previously wired; does not add or remove scopes.
  - See `anvil doctor` afterwards to verify.
EOF
}

# Help short-circuit (must work even if node/bun are missing).
for a in "$@"; do
  case "$a" in
    -h|--help) usage; exit 0 ;;
    *) echo "unknown flag: $a" >&2; echo "Try ./upgrade.sh --help" >&2; exit 2 ;;
  esac
done

# Print banner
VERSION=$(node -p "require('$ROOT/package.json').version" 2>/dev/null || echo '?')
printf '\033[1m\xe2\x96\xb6 Anvil upgrader\033[0m  v%s\n' "$VERSION"

# Runtime detection (Bun preferred)
if command -v bun >/dev/null 2>&1; then
  RUNTIME=bun
elif command -v node >/dev/null 2>&1; then
  MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
  if [ "$MAJOR" -lt 20 ]; then echo "node >= 20 required" >&2; exit 1; fi
  RUNTIME=node
else
  echo "neither bun nor node found" >&2
  exit 1
fi

# Rebuild if source tree changed (best-effort)
if [ -d "$ROOT/src" ]; then
  if [ ! -d "$ROOT/dist" ] || [ "$ROOT/src" -nt "$ROOT/dist" ]; then
    echo "rebuilding anvil..."
    if [ "$RUNTIME" = "bun" ]; then
      (cd "$ROOT" && bun install && bun run build)
    else
      (cd "$ROOT" && npm install && npm run build)
    fi
  fi
fi

if [ "$RUNTIME" = "bun" ] && [ -x "$ROOT/bin/anvil" ]; then
  exec bun "$ROOT/bin/anvil" upgrade
else
  exec node "$ROOT/bin/anvil.cjs" upgrade
fi
