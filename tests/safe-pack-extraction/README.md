# safe-pack-extraction — Placeholder Test Harness

**Status:** Placeholder — no tests yet. Created by ANV-0011.

## Purpose

When `--from-git` and `--from-archive` are implemented, this directory must
contain a traversal test suite **before** any archive extraction code ships.

## Required coverage (from `.anvil/research/spec-kit.research.md§2`)

The spec-kit reference implementation (`test_registrar_path_traversal.py`)
validates against **12 parameterised path-traversal payloads × 3 attack
surfaces**. Anvil's suite must cover the same matrix:

### Traversal payloads (12)

1. `../escape`
2. `../../double-escape`
3. `/absolute/path`
4. `./dotslash`
5. `dir/../../escape`
6. `%2e%2e/url-encoded`
7. `..%2Fescape`
8. `....//quadruple-dot`
9. `dir/../../../escape`
10. Null byte: `foo\x00../../etc/passwd`
11. Symlink pointing outside root
12. Windows-style: `..\escape` (cross-platform only)

### Attack surfaces (3)

1. **Archive member path** — every entry in a `.tar.gz` before extraction
2. **Install prefix / destination path** — computed output path
3. **Symlink target** — if archive members include symlinks

### Zip-slip pre-validation

All archive members must be validated **before** extracting any of them
(fail-fast, not fail-after-partial-extraction). Reference:
`spec-kit/extensions.py:1238-1251`.

## Implementation notes

- Tests go in this directory as `*.test.ts` (Vitest).
- Add a `testdata/` subdirectory with sample `.tar.gz` archives containing the
  traversal payloads above.
- Wire into `npm test` automatically (Vitest picks up `tests/**/*.test.ts`).
- See `.anvil/research/spec-kit.research.md§2` (item NEW-4) and
  `.anvil/research/spec-kit.research.md§3` (item 2) for the reference pattern.

## Related tickets

- **ANV-0011** — hid `--from-git`/`--from-archive` flags pending this harness
- **ANV-0014** — manifest contract (source-metadata field needed when implementing)
