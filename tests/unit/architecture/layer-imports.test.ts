/**
 * Architecture test: layer-import ordering.
 *
 * Layer ordering per src/CLAUDE.md:
 *   0 core → 1 skills → 2 hooks → 3 agents → 4 commands → 5 adapters → 6 tui → 7 installer
 *
 * No file in a lower-numbered layer may import from a higher-numbered layer,
 * except for the pre-existing edges listed in LAYER_IMPORT_ALLOWLIST.
 *
 * spec D-21 said 18 allowlisted edges; actual scan finds 17 (tui→installer has 6, not 7).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type AllowlistEntry,
  LAYER_IMPORT_ALLOWLIST,
} from './layer-imports.allowlist.js'

/**
 * src/ subdirectories that are intentionally NOT assigned a layer number.
 * These are either entry-point files (src/index.ts) or cross-cutting modules
 * that don't belong to the layered stack. Any new subdirectory NOT in
 * LAYER_MAP and NOT in this allowlist will trigger a test failure.
 */
const UNREGISTERED_SRC_DIR_ALLOWLIST = new Set<string>([
  // ANV-0245: experimental tree is layer-floating; isolation enforced by
  // tests/unit/architecture/experimental-isolation.test.ts instead.
  'experimental',
])

// ---------------------------------------------------------------------------
// Layer map — matches src/CLAUDE.md exactly
// ---------------------------------------------------------------------------
const LAYER_MAP: Record<string, number> = {
  core: 0,
  intent: 1,
  skills: 1,
  hooks: 2,
  agents: 3,
  commands: 4,
  adapters: 5,
  'opencode-plugin': 5,
  tui: 6,
  installer: 7,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const SRC_ROOT = join(REPO_ROOT, 'src')

/** Return the layer index for a src-relative path, or -1 if not in a known layer. */
function layerOf(repoRelPath: string): number {
  // repoRelPath e.g. "src/commands/cli/init.ts"
  const srcRel = repoRelPath.startsWith('src/')
    ? repoRelPath.slice('src/'.length)
    : repoRelPath
  const segment = srcRel.split('/')[0]
  return LAYER_MAP[segment] ?? -1
}

/** Recursively collect all .ts files under a directory, excluding test/declaration files. */
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

/**
 * Parse static `import ... from '...'` and `await import('...')` specifiers
 * from a source file's text.  Returns raw specifier strings.
 */
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

/**
 * Resolve a specifier from a source file to a repo-relative path (e.g.
 * "src/installer/plan.ts").  Returns null for third-party / node built-ins.
 *
 * NodeNext convention: `.js` extensions in source map to `.ts` on disk.
 */
function resolveSpecifier(
  specifier: string,
  sourceAbsPath: string,
): string | null {
  // Skip node built-ins and third-party packages
  if (!specifier.startsWith('.')) return null

  const sourceDir = dirname(sourceAbsPath)
  let candidate = resolve(sourceDir, specifier)

  // Strip .js extension and replace with .ts (NodeNext)
  if (candidate.endsWith('.js')) {
    candidate = `${candidate.slice(0, -3)}.ts`
  } else if (extname(candidate) === '') {
    // bare relative path — try appending .ts
    candidate = `${candidate}.ts`
  }

  // Must be inside src/
  if (!candidate.startsWith(`${SRC_ROOT}/`)) return null

  return `src/${relative(SRC_ROOT, candidate)}`
}

/** Collect all upward edges found in src/. Returns [{from, to}] pairs. */
function collectUpwardEdges(): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = []
  const files = walkTs(SRC_ROOT)

  for (const absPath of files) {
    const fromRel = `src/${relative(SRC_ROOT, absPath)}`
    const sourceLayer = layerOf(fromRel)
    if (sourceLayer === -1) continue // unknown layer (e.g. src/index.ts)

    let source: string
    try {
      source = readFileSync(absPath, 'utf8')
    } catch {
      continue
    }

    const specifiers = parseImportSpecifiers(source)
    for (const spec of specifiers) {
      const toRel = resolveSpecifier(spec, absPath)
      if (toRel === null) continue

      const targetLayer = layerOf(toRel)
      if (targetLayer === -1) continue // target not in a known layer

      if (targetLayer > sourceLayer) {
        edges.push({ from: fromRel, to: toRel })
      }
    }
  }

  return edges
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('architecture — layer-imports (Plan 45 C3, spec D-21)', () => {
  const allowlistSet = new Set<string>(
    LAYER_IMPORT_ALLOWLIST.map((e) => `${e.from}||${e.to}`),
  )

  it('no un-allowlisted upward layer imports exist in src/', () => {
    const actualEdges = collectUpwardEdges()
    const violations = actualEdges.filter(
      ({ from, to }) => !allowlistSet.has(`${from}||${to}`),
    )

    if (violations.length > 0) {
      const lines = violations
        .map(({ from, to }) => `  ${from} → ${to}`)
        .join('\n')
      expect.fail(
        `Found ${violations.length} un-allowlisted upward layer import(s):\n${lines}\n\nAdd them to LAYER_IMPORT_ALLOWLIST if they are intentional, or fix the imports.`,
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('negative guard — rule triggers for an unknown upward edge (in-memory stub)', () => {
    // Simulate what collectUpwardEdges would produce if a new violation appeared.
    // We inject a fake edge that is NOT in the allowlist, then verify the check catches it.
    const fakeEdge = { from: 'src/core/types.ts', to: 'src/installer/plan.ts' }
    const fakeEdges = [fakeEdge]

    const violations = fakeEdges.filter(
      ({ from, to }) => !allowlistSet.has(`${from}||${to}`),
    )

    expect(violations).toHaveLength(1)
    expect(violations[0]).toEqual(fakeEdge)
  })

  it('all src/ subdirectories are registered in LAYER_MAP or UNREGISTERED_SRC_DIR_ALLOWLIST', () => {
    // Fail loudly when a new src/ subdirectory is added without being assigned
    // a layer. Silent -1 skips were the root cause of opencode-plugin going
    // unscanned for months (Bundle B finding).
    const srcEntries = readdirSync(SRC_ROOT, { withFileTypes: true })
    const unregistered: string[] = []
    for (const entry of srcEntries) {
      if (!entry.isDirectory()) continue
      if (
        LAYER_MAP[entry.name] === undefined &&
        !UNREGISTERED_SRC_DIR_ALLOWLIST.has(entry.name)
      ) {
        unregistered.push(entry.name)
      }
    }
    if (unregistered.length > 0) {
      throw new Error(
        `src/ subdirector${unregistered.length === 1 ? 'y' : 'ies'} not registered in LAYER_MAP or UNREGISTERED_SRC_DIR_ALLOWLIST:\n${unregistered.map((d) => `  ${d}`).join('\n')}\n\nAdd to LAYER_MAP (with a layer number) or UNREGISTERED_SRC_DIR_ALLOWLIST.`,
      )
    }
    expect(unregistered).toHaveLength(0)
  })

  it('allowlist tightness — every allowlist entry corresponds to an actual edge', () => {
    const actualEdges = collectUpwardEdges()
    const actualSet = new Set<string>(
      actualEdges.map(({ from, to }) => `${from}||${to}`),
    )

    const deadEntries: AllowlistEntry[] = LAYER_IMPORT_ALLOWLIST.filter(
      (e) => !actualSet.has(`${e.from}||${e.to}`),
    )

    if (deadEntries.length > 0) {
      const lines = deadEntries.map((e) => `  ${e.from} → ${e.to}`).join('\n')
      expect.fail(
        `Found ${deadEntries.length} dead allowlist entr${deadEntries.length === 1 ? 'y' : 'ies'} (no matching edge in src/):\n${lines}\n\nRemove dead entries from LAYER_IMPORT_ALLOWLIST.`,
      )
    }

    expect(deadEntries).toHaveLength(0)
  })
})
