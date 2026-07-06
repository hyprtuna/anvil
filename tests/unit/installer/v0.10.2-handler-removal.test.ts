import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { loadAllHooks } from '../../../src/hooks/load-all.js'

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')

describe('v0.10.2 handler removal (Plan 39 Phase E)', () => {
  it('comment-checker.ts source file does not exist', () => {
    const p = join(ROOT, 'src/hooks/handlers/comment-checker.ts')
    expect(existsSync(p)).toBe(false)
  })

  it('ui-rules.ts source file does not exist', () => {
    const p = join(ROOT, 'src/hooks/handlers/ui-rules.ts')
    expect(existsSync(p)).toBe(false)
  })

  it('hook registry contains no comment-checker entry after loadAllHooks', () => {
    const config = buildDefaultConfig()
    const registry = loadAllHooks({ config })
    const entries = registry.getAll()
    const names = entries.map((e) => e.name)
    expect(names).not.toContain('comment-checker')
  })

  it('hook registry contains no ui-rules entry after loadAllHooks', () => {
    const config = buildDefaultConfig()
    const registry = loadAllHooks({ config })
    const entries = registry.getAll()
    const names = entries.map((e) => e.name)
    expect(names).not.toContain('ui-rules')
  })

  it('ui-anti-pattern-rules skill file exists at skills/universal/ui/rules.md', () => {
    const p = join(ROOT, 'skills/universal/ui/rules.md')
    expect(existsSync(p)).toBe(true)
  })
})
