Map Conventional Commits prefixes to changelog sections:

| Prefix | Section |
|---|---|
| `feat:`, `feat(scope):` | Added |
| `fix:`, `fix(scope):` | Fixed |
| `perf:` | Improved |
| `refactor:` (user-visible effect) | Improved |
| `BREAKING CHANGE` or `!` suffix | Breaking Changes |
| `security:`, `sec:` | Security |
| `docs:` (public-facing docs only) | Documentation |
| `deprecate:`, `deprecated:` | Deprecated |
| `remove:`, `removed:` | Removed |

**Filter out** (do not include in the changelog):
- `chore:`, `ci:`, `build:`, `test:`, `style:`, `refactor:` (internal only)
- Commit messages that are clearly internal fixups: "fix typo", "update deps", "fmt"

**Format the output:**

```markdown
## [vX.Y.Z] — YYYY-MM-DD

### Breaking Changes

- Removes the deprecated `--legacy` flag. Use `--compat` instead.

### Added

- Adds support for OpenCode adapter in `anvil init`.
- Adds `--include-hidden` flag to `anvil skill list`.

### Fixed

- Fixes skill loader crashing when a frontmatter field contains a tab character.
- Fixes `anvil doctor` reporting false drift on Windows paths.

### Improved

- Reduces `anvil build` cold-start time by ~40% by lazy-loading adapter modules.

### Security

- Updates `@anthropic/sdk` to address CVE-2025-XXXX.
```
