#!/usr/bin/env bash
set -euo pipefail

# anvil uninstaller — thin Bash wrapper over the install-driver uninstall/purge commands.
# Run `./uninstall.sh --help` for the full flag list.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
anvil uninstaller — remove Anvil from Claude Code and/or OpenCode

Usage:
  ./uninstall.sh                         Interactive TUI (asks what to remove)
  ./uninstall.sh [flags]                 Non-interactive removal

Target flags (choose one or combine):
  --claude-code-user | --claude-code-project
  --opencode-user    | --opencode-project
  --all                                  Unwire every target

Purge (remove ~/.anvil too):
  --purge                                Unwire everything and delete ~/.anvil

Other:
  --cli                                  Also remove ~/.local/bin/anvil symlink
  --dry-run                              Print actions without applying
  --verbose                              Verbose logging
  --force                                Skip confirmations
  --yes                                  Skip confirmations
  -h, --help                             Show this help and exit

Examples:
  ./uninstall.sh --all                   # unwire every scope, keep ~/.anvil
  ./uninstall.sh --purge                 # full wipe
  ./uninstall.sh --claude-code-project   # only this project's Claude Code wire
EOF
}

# Help short-circuit (must work even if node/bun are missing).
for a in "$@"; do
  case "$a" in
    -h|--help) usage; exit 0 ;;
  esac
done

# Print banner
printf '\033[1m\xe2\x96\xb6 Anvil uninstaller\033[0m\n'

DRIVER="$ROOT/bin/install-driver.cjs"
if [ -f "$HOME/.anvil/bin/install.cjs" ]; then
  DRIVER="$HOME/.anvil/bin/install.cjs"
fi

# Detect whether the user passed any non-interactive flags.
# If so, use the current flag-through path; otherwise launch the interactive TUI.
INTERACTIVE=true
CMD="uninstall"
ARGS=()

for a in "$@"; do
  case "$a" in
    --purge) INTERACTIVE=false; CMD="purge" ;;
    --all)   INTERACTIVE=false; ARGS+=("--all") ;;
    --claude-code-user|--claude-code-project|--opencode-user|--opencode-project)
             INTERACTIVE=false; ARGS+=("$a") ;;
    --cli)   INTERACTIVE=false; ARGS+=("--cli") ;;
    --force) INTERACTIVE=false; ARGS+=("--force") ;;
    --dry-run|--verbose) INTERACTIVE=false; ARGS+=("$a") ;;
    --yes)   INTERACTIVE=false; ARGS+=("$a") ;;
    *)       echo "unknown flag: $a" >&2; echo "Try ./uninstall.sh --help" >&2; exit 2 ;;
  esac
done

if [ "$INTERACTIVE" = "true" ]; then
  exec node "$DRIVER" uninstall
fi

exec node "$DRIVER" "$CMD" "${ARGS[@]}"
