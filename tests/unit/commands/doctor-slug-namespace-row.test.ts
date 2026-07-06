import { describe, expect, it } from 'vitest'
import { pushSlugNamespaceCheck } from '../../../src/commands/cli/doctor.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

describe('doctor — Slug-namespace integrity row (Plan 40 Phase E)', () => {
  it('fails on the synthetic-slug-collision fixture (Plan 41 D-04 escalation)', () => {
    // Plan 40 D-02 shipped this row at warn-only. Plan 41 D-04 promotes
    // warn → fail per the escalation gate ("if v0.10.3 dogfood shows zero
    // reintroduced violations") — which it did.
    const checks: Check[] = []
    const fixtureCwd = `${process.cwd()}/tests/fixtures/synthetic-slug-collision`
    pushSlugNamespaceCheck(checks, fixtureCwd, true, 'no project')
    const row = checks.find((c) => c.name === 'Slug-namespace integrity')
    expect(row, 'row should exist').toBeDefined()
    expect(row!.status).toBe('fail')
    // The fixture has 3 violations: collision (code-reviewer), skill-doer-suffix
    // (code-reviewer + some-doer), agent missing suffix (foo-bar).
    expect(row!.detail).toContain('collisions')
    expect(row!.detail).toMatch(/skill doer-suffix|some-doer|code-reviewer/)
    expect(row!.detail).toContain('foo-bar')
  })

  it('skips when not in a project', () => {
    const checks: Check[] = []
    pushSlugNamespaceCheck(checks, '/tmp', false, 'not in project')
    const row = checks.find((c) => c.name === 'Slug-namespace integrity')
    expect(row!.status).toBe('skip')
  })
})
