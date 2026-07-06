#!/usr/bin/env bash
# scripts/release.sh — bump version, update CHANGELOG, tag, push.
# Usage: scripts/release.sh <new-version>
set -euo pipefail

if [ $# -ne 1 ]; then echo "Usage: $0 <new-version>  (e.g., 0.1.0-beta.2)"; exit 1; fi
NEW_VERSION="$1"

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: version must match <major>.<minor>.<patch>[-prerelease]"; exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is dirty. Commit or stash first."; exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Error: must release from main (currently on $CURRENT_BRANCH)"; exit 1
fi

npm run typecheck && npm run build && npm test
npm version "$NEW_VERSION" --no-git-tag-version

DATE=$(date +%Y-%m-%d)
sed -i.bak "s/## \[Unreleased\]/## [Unreleased]\n\n## [$NEW_VERSION] — $DATE/" CHANGELOG.md
rm CHANGELOG.md.bak

git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): $NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "✓ Prepared release v$NEW_VERSION"
echo "  Next: git push origin main && git push origin v$NEW_VERSION"
