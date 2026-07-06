#!/usr/bin/env bash
# refresh-references.sh — fetch + pull every git repo under references/
#
# Per the v1.0.0 practice (2026-05-17): references inform implementation but
# they're gitignored research-only checkouts. Refresh before each release
# implementation pass so we adapt against current upstream, not stale snapshots.
#
# Usage:
#   bash scripts/dev/refresh-references.sh         # fetch + fast-forward all
#   bash scripts/dev/refresh-references.sh --dry   # show what would update
#   bash scripts/dev/refresh-references.sh <name>  # refresh a single ref
#
# Exit codes:
#   0 — all refs up to date or fast-forwarded cleanly
#   1 — at least one ref is dirty, diverged, or fetch failed
#
# Safe by design:
#   - Never force-pushes, never rebases interactively.
#   - Refuses to pull if a worktree is dirty (prints status and continues to next).
#   - Refuses to pull if the local branch has diverged (i.e. you've made changes).

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF_DIR="$ROOT/references"
DRY=0
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --dry|-n) DRY=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) TARGET="$arg" ;;
  esac
done

if [ ! -d "$REF_DIR" ]; then
  echo "no references/ dir at $REF_DIR" >&2; exit 1
fi

status=0
for d in "$REF_DIR"/*/; do
  name="$(basename "$d")"
  [ -n "$TARGET" ] && [ "$name" != "$TARGET" ] && continue
  [ ! -d "$d/.git" ] && { printf "%-30s SKIP (not a git repo)\n" "$name"; continue; }

  cd "$d" || { status=1; continue; }
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo detached)"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    printf "%-30s DIRTY  (skipping; run `cd %s && git status`)\n" "$name" "$d"
    status=1; cd "$ROOT"; continue
  fi

  if ! git fetch --quiet origin 2>/dev/null; then
    printf "%-30s FETCH FAILED\n" "$name"
    status=1; cd "$ROOT"; continue
  fi

  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "@{u}" 2>/dev/null || echo "")"

  if [ -z "$remote_sha" ]; then
    printf "%-30s NO UPSTREAM (%s)\n" "$name" "$branch"
    cd "$ROOT"; continue
  fi

  if [ "$local_sha" = "$remote_sha" ]; then
    printf "%-30s up-to-date    (%s)\n" "$name" "$branch"
    cd "$ROOT"; continue
  fi

  base="$(git merge-base HEAD "@{u}")"
  if [ "$base" != "$local_sha" ]; then
    printf "%-30s DIVERGED (local has commits upstream doesn't); skipping\n" "$name"
    status=1; cd "$ROOT"; continue
  fi

  count="$(git rev-list --count HEAD..@{u})"
  if [ "$DRY" -eq 1 ]; then
    printf "%-30s would pull %s commits (%s)\n" "$name" "$count" "$branch"
  else
    if git merge --ff-only --quiet "@{u}"; then
      printf "%-30s pulled  %s commits  (%s)\n" "$name" "$count" "$branch"
    else
      printf "%-30s FF-MERGE FAILED\n" "$name"
      status=1
    fi
  fi
  cd "$ROOT"
done

exit $status
