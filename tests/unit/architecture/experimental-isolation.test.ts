/**
 * ANV-0245 — Experimental isolation architecture test.
 *
 * Asserts that NO non-experimental source file statically imports from
 * `src/experimental/`.
 *
 * Whitelist: the single dynamic `import()` in `src/index.ts` (ANV-0248).
 * All other import forms from `src/experimental/` in non-experimental files
 * are policy violations.
 *
 * Method: text-scan all `.ts` files under `src/` that are NOT inside
 * `src/experimental/`. Check for import specifiers containing
 * `/experimental/` or `'./experimental` etc. that would resolve into the
 * experimental tree. Dynamic imports in `src/index.ts` are excluded by
 * the whitelist.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const SRC_ROOT = join(REPO_ROOT, 'src')

// ─── Whitelist ────────────────────────────────────────────────────────────────
/**
 * Files allowed to import from src/experimental/. Paths are relative to
 * REPO_ROOT. Only dynamic imports are allowed even for whitelisted files.
 *
 * src/index.ts          — ANV-0248: loads experimental/register-cli.js when
 *                         the experimental build is active.
 * src/hooks/handlers/on-large-output.ts — ANV-0247: loads
 *   experimental/notepads/core/stash.js; absent in default build (ERR_MODULE_NOT_FOUND
 *   is swallowed silently; any other error emits a stderr warning).
 */
const DYNAMIC_IMPORT_WHITELIST = new Set([
  'src/index.ts',
  'src/hooks/handlers/on-large-output.ts',
])

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect all .ts files NOT inside src/experimental/ */
function walkNonExperimental(dir: string): string[] {
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
      // Skip the experimental subtree itself
      if (full === join(SRC_ROOT, 'experimental')) continue
      out.push(...walkNonExperimental(full))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full)
    }
  }
  return out
}

/**
 * Returns true if the given import specifier resolves into src/experimental/.
 *
 * Heuristic: specifier contains 'experimental' as a path segment relative
 * to the source file, or is an absolute path containing '/experimental/'.
 * This catches:
 *   './experimental/register-cli.js'
 *   '../experimental/some-module.js'
 *   '../../experimental/catalog/index.js'
 */
function specifierIsExperimental(specifier: string): boolean {
  // Split on '/' and check for a segment equal to 'experimental'
  const parts = specifier.split('/')
  return parts.includes('experimental')
}

/**
 * Parse static import specifiers from source text.
 * Returns { specifier, isDynamic }[].
 */
function parseImports(
  source: string,
): Array<{ specifier: string; isDynamic: boolean }> {
  const results: Array<{ specifier: string; isDynamic: boolean }> = []

  // Static: import ... from '...'
  const staticRe = /\bimport\b(?!\s*\()[\s\S]*?from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  m = staticRe.exec(source)
  while (m !== null) {
    results.push({ specifier: m[1], isDynamic: false })
    m = staticRe.exec(source)
  }

  // Dynamic: import('...')
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  m = dynamicRe.exec(source)
  while (m !== null) {
    results.push({ specifier: m[1], isDynamic: true })
    m = dynamicRe.exec(source)
  }

  return results
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe('experimental-isolation', () => {
  it('no non-experimental source file statically imports from src/experimental/', () => {
    const violations: string[] = []
    const files = walkNonExperimental(SRC_ROOT)

    for (const absPath of files) {
      const repoRel = absPath.replace(`${REPO_ROOT}/`, '')
      let source: string
      try {
        source = readFileSync(absPath, 'utf-8')
      } catch {
        continue
      }

      const imports = parseImports(source)
      for (const { specifier, isDynamic } of imports) {
        if (!specifierIsExperimental(specifier)) continue

        // Dynamic imports in whitelisted files are allowed (ANV-0248)
        if (isDynamic && DYNAMIC_IMPORT_WHITELIST.has(repoRel)) continue

        violations.push(
          `${repoRel}: ${isDynamic ? 'dynamic' : 'static'} import "${specifier}"`,
        )
      }
    }

    expect(
      violations,
      `Illegal imports from src/experimental/:\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  it('src/experimental/ directory itself exists', () => {
    const stat = statSync(join(SRC_ROOT, 'experimental'), {
      throwIfNoEntry: false,
    })
    expect(stat?.isDirectory()).toBe(true)
  })
})
