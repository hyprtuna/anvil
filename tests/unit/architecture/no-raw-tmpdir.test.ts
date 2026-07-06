import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const TESTS_ROOT = join(__dirname, '..', '..', '..', 'tests')

// TODO(ANV-0165): regex coverage is text-based. Aliased imports like
// `import { mkdtempSync as foo }` are out of scope; the convention is
// "no raw mkdtempSync(join(tmpdir(), ...))" — that's what we enforce.
const FORBIDDEN = [
  /mkdtempSync\s*\(\s*join\s*\(\s*tmpdir\(\)/,
  /mkdtempSync\s*\(\s*join\s*\(\s*os\.tmpdir\(\)/,
  /\bmkdtemp\s*\(\s*join\s*\(\s*tmpdir\(\)/,
  /\bmkdtemp\s*\(\s*join\s*\(\s*os\.tmpdir\(\)/,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('architecture: no raw tmpdir() in tests', () => {
  const files = walk(TESTS_ROOT)
  // Exempt the helper itself and this arch test (which contains the pattern as a string literal).
  const HELPER = join(TESTS_ROOT, 'helpers', 'tmpdir.ts')
  const SELF = join(TESTS_ROOT, 'unit', 'architecture', 'no-raw-tmpdir.test.ts')

  for (const f of files) {
    if (f === HELPER || f === SELF) continue
    const rel = relative(TESTS_ROOT, f)
    it(`${rel} uses createTestTmpDir not raw mkdtempSync(tmpdir())`, () => {
      const src = readFileSync(f, 'utf8')
      for (const pat of FORBIDDEN) {
        expect(
          src.match(pat)?.[0] ?? null,
          `${rel}: use createTestTmpDir from tests/helpers/tmpdir.ts`,
        ).toBeNull()
      }
    })
  }
})
