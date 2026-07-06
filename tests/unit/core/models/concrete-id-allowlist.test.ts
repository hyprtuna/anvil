import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Plan 41 Phase B / D-01 — invariant: concrete provider model IDs may appear
 * in source only in `src/core/models/aliases.ts` (the alias map) and
 * `src/core/models/effort.ts` (the capability registry). Every other file
 * under `src/` and every preset under `presets/` must use short aliases
 * (`cheap`/`balanced`/`best` or legacy `haiku`/`sonnet`/`opus`).
 *
 * Allowlist rationale:
 *   - aliases.ts: the one place a provider model bump is applied.
 *   - effort.ts: provider capability data, intentionally keyed by concrete ID.
 *
 * Tests, plans, research, specs are exempt (they're not production code).
 * JSDoc in `src/core/types.ts` is intentionally NOT exempt — drift there
 * has been the root cause of past confusion.
 */

const REPO = join(__dirname, '..', '..', '..', '..')
const CONCRETE_ID_RE = /claude-(haiku|sonnet|opus)-\d/

const ROOTS = ['src', 'presets']
const ALLOWLIST = new Set<string>([
  'src/core/models/aliases.ts',
  'src/core/models/effort.ts',
])

function walk(dir: string): string[] {
  const out: string[] = []
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()
    if (cur === undefined) break
    let entries: string[]
    try {
      entries = readdirSync(cur)
    } catch {
      continue
    }
    for (const name of entries) {
      const full = join(cur, name)
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.'))
          continue
        stack.push(full)
      } else if (st.isFile()) {
        if (
          name.endsWith('.ts') ||
          name.endsWith('.tsx') ||
          name.endsWith('.json') ||
          name.endsWith('.md')
        ) {
          out.push(full)
        }
      }
    }
  }
  return out
}

describe('concrete-id allowlist (Plan 41 D-01)', () => {
  it('only aliases.ts and effort.ts contain concrete claude-* model IDs', () => {
    const offenders: Array<{ path: string; line: string }> = []

    for (const root of ROOTS) {
      const absRoot = join(REPO, root)
      for (const file of walk(absRoot)) {
        const rel = relative(REPO, file).replace(/\\/g, '/')
        if (ALLOWLIST.has(rel)) continue
        const text = readFileSync(file, 'utf-8')
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? ''
          if (CONCRETE_ID_RE.test(line)) {
            offenders.push({ path: rel, line: `${i + 1}: ${line.trim()}` })
          }
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders
        .slice(0, 20)
        .map((o) => `  ${o.path}:${o.line}`)
        .join('\n')
      throw new Error(
        `${offenders.length} concrete-ID violation(s) outside allowlist:\n${msg}`,
      )
    }
    expect(offenders.length).toBe(0)
  })
})
