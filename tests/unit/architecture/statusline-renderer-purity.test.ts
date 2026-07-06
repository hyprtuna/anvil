/**
 * Architecture test: statusline renderer I/O purity (ANV-0062)
 * and OSC 8 emission confinement (ANV-0110).
 *
 * The render-*.ts files in src/core/statusline/ must not import
 * node:child_process. Git I/O belongs in the aggregator layer
 * (src/commands/cli/statusline.ts), not in the pure renderer.
 *
 * All raw OSC 8 hyperlink sequences (`ESC]8;;`) must only be emitted from
 * the `link()` function in shared.ts, not constructed inline in renderer files.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const RENDERER_DIR = join(REPO_ROOT, 'src', 'core', 'statusline')

/** Return all render-*.ts files in the statusline directory. */
function findRendererFiles(): string[] {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(RENDERER_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.startsWith('render-') &&
        e.name.endsWith('.ts') &&
        !e.name.endsWith('.test.ts') &&
        !e.name.endsWith('.d.ts'),
    )
    .map((e) => join(RENDERER_DIR, e.name))
}

describe('architecture — statusline renderer purity', () => {
  it('src/core/statusline/render-*.ts files do not import node:child_process', () => {
    const files = findRendererFiles()
    expect(files.length).toBeGreaterThan(0) // guard: at least one renderer exists

    const violations: string[] = []
    for (const absPath of files) {
      let source: string
      try {
        source = readFileSync(absPath, 'utf8')
      } catch {
        continue
      }
      // Check for actual import/require of child_process (not comments or doc strings).
      // Pattern: import ... from 'node:child_process' or 'child_process',
      // or require('child_process').
      const importPattern =
        /import\s[^'"]*from\s+['"](?:node:)?child_process['"]|require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/
      if (importPattern.test(source)) {
        violations.push(absPath.replace(`${REPO_ROOT}/`, ''))
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Renderer purity violation — found child_process import in:\n${violations.map((v) => `  ${v}`).join('\n')}\n\nMove I/O calls to src/commands/cli/statusline.ts (the aggregator layer).`,
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('negative guard — purity check triggers on a simulated violation', () => {
    // Synthetic source that would fail the check
    const syntheticSource = `import { execSync } from 'node:child_process'\nexport function foo() {}`
    const importPattern =
      /import\s[^'"]*from\s+['"](?:node:)?child_process['"]|require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/
    expect(importPattern.test(syntheticSource)).toBe(true)
  })
})

describe('architecture — OSC 8 confinement to shared.ts link()', () => {
  /**
   * Raw OSC 8 sequences (ESC]8;;) must only be constructed in shared.ts.
   * Renderer files (render-*.ts) must delegate to link() from shared.ts
   * rather than building OSC 8 sequences inline. This ensures all emissions
   * pass through the sanitisation path.
   */
  it('render-*.ts files do not construct raw OSC 8 sequences inline', () => {
    const rendererFiles = findRendererFiles()
    expect(rendererFiles.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const absPath of rendererFiles) {
      let source: string
      try {
        source = readFileSync(absPath, 'utf8')
      } catch {
        continue
      }
      // Match literal ESC]8;; patterns — either as hex escape \x1b]8;; or
      // as a template literal using an ESC variable followed by ]8;;
      // Exclude comment lines (// or *) to avoid false positives on docs.
      const lines = source.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trimStart()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
        if (/\\x1b\]8;;|\${ESC}\]8;;/.test(line)) {
          violations.push(`${absPath.replace(`${REPO_ROOT}/`, '')}:${i + 1}`)
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `OSC 8 confinement violation — raw ESC]8;; constructed outside shared.ts link():\n${violations.map((v) => `  ${v}`).join('\n')}\n\nUse link() from shared.ts instead.`,
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('shared.ts is the only statusline source file containing raw OSC 8 construction', () => {
    // shared.ts is allowed to construct the raw sequence inside link().
    // No other .ts file in the statusline directory should build the sequence inline.
    const STATUSLINE_DIR = join(REPO_ROOT, 'src', 'core', 'statusline')
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(STATUSLINE_DIR, { withFileTypes: true })
    } catch {
      return
    }
    const nonSharedFiles = entries
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith('.ts') &&
          !e.name.endsWith('.d.ts') &&
          e.name !== 'shared.ts',
      )
      .map((e) => join(STATUSLINE_DIR, e.name))

    const violations: string[] = []
    for (const absPath of nonSharedFiles) {
      let source: string
      try {
        source = readFileSync(absPath, 'utf8')
      } catch {
        continue
      }
      const lines = source.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trimStart()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
        if (/\\x1b\]8;;|\${ESC}\]8;;/.test(line)) {
          violations.push(`${absPath.replace(`${REPO_ROOT}/`, '')}:${i + 1}`)
        }
      }
    }

    expect(violations).toHaveLength(0)
  })
})
