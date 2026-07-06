import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPTS_DIR = join(import.meta.dirname, '../../../../scripts/agent')

describe('no-substring-mainguard — lock', () => {
  it('no scripts/agent/*.ts uses argv[1]?.includes(...)', () => {
    const tsFiles = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.ts'))
    const violations: string[] = []
    for (const f of tsFiles) {
      const src = readFileSync(join(SCRIPTS_DIR, f), 'utf-8')
      if (/argv\[1\]\?\.includes/.test(src)) violations.push(f)
    }
    expect(violations).toEqual([])
  })
})
