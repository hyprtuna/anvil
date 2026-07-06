#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/smoke-install.sh [row-name]
# Runs one or all rows of the matrix against disposable HOMEs.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_row() {
  local name="$1" targets="$2"
  local H; H=$(mktemp -d)
  local P; P=$(mktemp -d)  # fake project dir
  trap 'rm -rf "$H" "$P"' RETURN
  echo "=== $name ==="
  (export HOME="$H" XDG_CONFIG_HOME="$H/.config"; cd "$P" && "$ROOT/install.sh" --from-local "$ROOT" $targets --prefix "$H/.anvil")
  case "$name" in
    cc-user) test -f "$H/.claude/plugins/installed_plugins.json" || { echo "FAIL: no registry"; exit 1; } ;;
    cc-project) test -f "$P/.claude/settings.json" || { echo "FAIL: no settings"; exit 1; } ;;
    oc-user) grep -q "anvil/plugins/opencode" "$H/.config/opencode/opencode.json" || { echo "FAIL: no oc plugin"; exit 1; } ;;
    oc-project) grep -q "anvil/plugins/opencode" "$P/.opencode/opencode.json" || { echo "FAIL: no project oc plugin"; exit 1; } ;;
    all) test -f "$H/.claude/plugins/installed_plugins.json" && test -f "$P/.claude/settings.json" && grep -q "anvil/plugins/opencode" "$H/.config/opencode/opencode.json" && grep -q "anvil/plugins/opencode" "$P/.opencode/opencode.json" ;;
    none) test -d "$H/.anvil" && ! test -d "$H/.claude/plugins" ;;
  esac
  (export HOME="$H" XDG_CONFIG_HOME="$H/.config"; cd "$P" && "$ROOT/uninstall.sh" --all --purge)
  ! test -d "$H/.anvil" || { echo "FAIL: purge left ~/.anvil"; exit 1; }
  echo "$name OK"
}

rows=(
  "cc-user --claude-code-user"
  "cc-project --claude-code-project"
  "oc-user --opencode-user"
  "oc-project --opencode-project"
  "all --all"
  "none --none"
)

if [[ $# -gt 0 ]]; then
  for r in "${rows[@]}"; do
    if [[ "${r%% *}" == "$1" ]]; then run_row ${r%% *} "${r#* }"; exit 0; fi
  done
  echo "unknown row: $1" >&2; exit 2
else
  for r in "${rows[@]}"; do run_row ${r%% *} "${r#* }"; done
fi
