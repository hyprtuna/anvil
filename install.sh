#!/usr/bin/env bash
set -euo pipefail

# anvil installer — thin Bash wrapper over the anvil CLI
#
# Modes:
#   ./install.sh                          Launch the interactive TUI (anvil init)
#   ./install.sh --yes [flags]            Non-interactive anvil init with friendly flags
#                                         (--target, --scope, --preset, --claude, --opencode, etc.)
#   ./install.sh --<target-flag> [flags]  Low-level install-driver path for target-scoped wires
#                                         (--claude-code-user, --opencode-project, --all, --none,
#                                         --from-local, --prefix, --cli)
#
# Run `./install.sh --help` for the full flag list.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
anvil installer — install Anvil into Claude Code and/or OpenCode

Usage:
  ./install.sh                              Interactive TUI (recommended)
  ./install.sh --yes [init-flags]           Non-interactive install via `anvil init`
  ./install.sh <target-flag> [driver-flags] Low-level install-driver path

Init flags (pair with --yes):
  --target <claude-code|opencode|both>  Which adapters to wire (default: both)
  --scope <project|global>              Install scope (default: project)
  --preset <balanced|cost-optimised|max-quality|speed-first>
                                        Model preset (default: balanced)
  --claude <yes|no>                     Override --target for Claude Code
  --opencode <yes|no>                   Override --target for OpenCode
  --statusline                          Enable Claude Code status line
  --cli                                 Symlink ~/.local/bin/anvil → anvilHome/bin/anvil.cjs
  --dry-run                             Print the plan without executing

Low-level driver flags (skip --yes):
  --claude-code-user | --claude-code-project
  --opencode-user    | --opencode-project
  --all              | --none
  --cli              Also create ~/.local/bin/anvil symlink (driver path)
  --prefix <dir>     Override $HOME/.anvil
  --from-local <dir> Use a local Anvil source directory
  --force            Skip v1-residue safety check
  --dry-run | --verbose

Other:
  -h, --help   Show this help and exit

Examples:
  ./install.sh                                            # interactive TUI
  ./install.sh --yes --preset balanced --target both      # friendly defaults
  ./install.sh --all --cli                                # wire every target + CLI symlink
EOF
}

# Help short-circuit — must come before runtime detection so it works even if
# node/bun are missing.
for a in "$@"; do
  case "$a" in
    -h|--help) usage; exit 0 ;;
  esac
done

# Print banner
VERSION=$(node -p "require('$ROOT/package.json').version" 2>/dev/null || echo '?')
printf '\033[1m\xe2\x96\xb6 Anvil installer\033[0m  v%s\n' "$VERSION"

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

# Build if needed (source checkout path)
if [ -d "$ROOT/src" ] && [ ! -d "$ROOT/dist" ]; then
  echo "building anvil..."
  if [ "$RUNTIME" = "bun" ]; then
    (cd "$ROOT" && bun install && bun run build)
  else
    (cd "$ROOT" && npm install && npm run build)
  fi
fi

# Route: user-friendly (anvil init) vs low-level (install-driver).
# The main `anvil` CLI understands the `init` command + friendly flags;
# the install driver handles target-scoped wires the TUI cannot express.
INIT_FLAGS=(--yes --target --scope --preset --claude --opencode --statusline --cli --dry-run --diff --json)
DRIVER_FLAGS=(--claude-code-user --claude-code-project --opencode-user --opencode-project
              --all --none --prefix --from-local
              --force --verbose)

is_in_list() {
  local needle="$1"; shift
  for x in "$@"; do [ "$needle" = "$x" ] && return 0; done
  return 1
}

MODE=interactive
for a in "$@"; do
  # Extract the bare flag name (strip `=value` tails).
  flag="${a%%=*}"
  if is_in_list "$flag" "${DRIVER_FLAGS[@]}"; then
    MODE=driver
    break
  fi
  if is_in_list "$flag" "${INIT_FLAGS[@]}"; then
    MODE=init
    # don't break — a later driver flag should still force MODE=driver
  fi
done

run_anvil_cli() {
  # Invoke the main anvil CLI (has proper `init` command with --yes, --preset, etc.)
  if [ "$RUNTIME" = "bun" ] && [ -x "$ROOT/bin/anvil" ]; then
    exec bun "$ROOT/bin/anvil" "$@"
  else
    exec node "$ROOT/bin/anvil.cjs" "$@"
  fi
}

if [ "$MODE" = "interactive" ] || [ "$MODE" = "init" ]; then
  run_anvil_cli init "$@"
fi

# Driver path: prefer the already-installed driver; otherwise use repo-local.
DRIVER="$ROOT/bin/install-driver.cjs"
if [ -f "$HOME/.anvil/bin/install.cjs" ]; then
  DRIVER="$HOME/.anvil/bin/install.cjs"
fi

ARGS=("install" "$@")

# Auto-default: if --from-local is not passed, use the repo root
HAS_FROM=false
for a in "$@"; do
  case "$a" in
    --from-local) HAS_FROM=true; break ;;
  esac
done
if [ "$HAS_FROM" = "false" ]; then
  ARGS+=("--from-local" "$ROOT")
fi

exec node "$DRIVER" "${ARGS[@]}"
