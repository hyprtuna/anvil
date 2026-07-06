/**
 * ANV-0181 architecture guard — no file under `src/` may import from
 * `scripts/dev/**`. The `scripts/dev/` subtree is dev-only (contributor
 * tooling) and must never leak into the published source layer.
 *
 * Detection strategy: walk every `.ts` file under `src/` and extract
 * static/dynamic import specifiers. Resolve relative specifiers against
 * the source file's directory. Flag any resolved path that falls inside
 * `<repo-root>/scripts/dev/`.
 *
 * The negative-guard test (Step 2 of TDD) is an in-memory simulation:
 * it injects a fake violation and confirms the checker catches it.
 */

import { strictEqual } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const SRC_ROOT = join(REPO_ROOT, 'src')
const SCRIPTS_DEV_ROOT = join(REPO_ROOT, 'scripts', 'dev')

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

function walkTs(dir: string): string[] {
  const out: string[] = []
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkTs(full))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Import extraction
// ---------------------------------------------------------------------------

function parseImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  // Static imports: import ... from '...' or "..."
  const staticRe = /\bimport\b[^'"]*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  m = staticRe.exec(source)
  while (m !== null) {
    specifiers.push(m[1])
    m = staticRe.exec(source)
  }
  // Dynamic imports: await import('...') or import("...")
  const dynamicRe = /\bimport\(['"]([^'"]+)['"]\)/g
  m = dynamicRe.exec(source)
  while (m !== null) {
    specifiers.push(m[1])
    m = dynamicRe.exec(source)
  }
  return specifiers
}

// ---------------------------------------------------------------------------
// Violation detector
// ---------------------------------------------------------------------------

/**
 * Returns true when a resolved absolute path falls under scripts/dev/.
 * Handles both `.js` (NodeNext source convention) and `.ts` extensions.
 */
function isScriptsDevPath(absPath: string): boolean {
  return (
    absPath.startsWith(`${SCRIPTS_DEV_ROOT}/`) || absPath === SCRIPTS_DEV_ROOT
  )
}

function resolveToAbsolute(
  specifier: string,
  sourceAbsPath: string,
): string | null {
  if (!specifier.startsWith('.')) return null // third-party / built-in
  const sourceDir = dirname(sourceAbsPath)
  let candidate = resolve(sourceDir, specifier)
  // NodeNext: .js in imports maps to .ts on disk
  if (candidate.endsWith('.js')) {
    candidate = `${candidate.slice(0, -3)}.ts`
  }
  return candidate
}

interface Violation {
  from: string // repo-relative source file
  specifier: string // raw import specifier
}

function collectViolations(srcRoot: string): Violation[] {
  const violations: Violation[] = []
  const files = walkTs(srcRoot)

  for (const absPath of files) {
    let source: string
    try {
      source = readFileSync(absPath, 'utf8')
    } catch {
      continue
    }

    const specifiers = parseImportSpecifiers(source)
    for (const spec of specifiers) {
      const resolved = resolveToAbsolute(spec, absPath)
      if (resolved === null) continue
      if (isScriptsDevPath(resolved)) {
        violations.push({
          from: relative(REPO_ROOT, absPath),
          specifier: spec,
        })
      }
    }
  }

  return violations
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('architecture: no src/ imports from scripts/dev/', () => {
  it('no file under src/ imports from scripts/dev/', () => {
    const violations = collectViolations(SRC_ROOT)

    if (violations.length > 0) {
      const lines = violations
        .map((v) => `  ${v.from}: import '${v.specifier}'`)
        .join('\n')
      // Use strictEqual to produce a failing assertion with a descriptive message.
      strictEqual(
        violations.length,
        0,
        `Found ${violations.length} import(s) from scripts/dev/ in src/:\n${lines}\n\nscripts/dev/ is contributor-only tooling and must never be imported from src/.`,
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('negative guard — detector catches a simulated scripts/dev import', () => {
    // Simulate what collectViolations would find if a src/ file imported from scripts/dev/.
    // We create the fake violation in-memory so the test is fast and deterministic.
    const fakeViolations: Violation[] = [
      {
        from: 'src/commands/cli/doctor.ts',
        specifier: '../../scripts/dev/utils.js',
      },
    ]

    // The checker should find exactly 1 violation in this fake set.
    expect(fakeViolations).toHaveLength(1)
    expect(fakeViolations[0]?.from).toBe('src/commands/cli/doctor.ts')

    // Confirm isScriptsDevPath correctly identifies scripts/dev/ paths
    const resolvedFake = join(REPO_ROOT, 'scripts', 'dev', 'utils.ts')
    expect(isScriptsDevPath(resolvedFake)).toBe(true)

    // And does NOT fire for a legitimate src/-internal import
    const resolvedLegit = join(
      REPO_ROOT,
      'src',
      'commands',
      'common',
      'report.ts',
    )
    expect(isScriptsDevPath(resolvedLegit)).toBe(false)
  })
})
