import { describe, expect, it } from 'vitest'
import { pushRecommendedIntegrationsCheck } from '../../../src/commands/cli/doctor.js'

interface Check {
  name: string
  status: string
  detail: string
}

const ROW_NAME = 'Recommended integrations'

/** Build a minimal valid v2 installed_plugins.json payload. */
function makePayload(slugs: string[]): unknown {
  const plugins: Record<string, unknown> = {}
  for (const slug of slugs) {
    plugins[`${slug}@user`] = [{ scope: 'user' }]
  }
  return { version: 2, plugins }
}

describe('pushRecommendedIntegrationsCheck', () => {
  it('skips when payload is null (file absent)', () => {
    const checks: Check[] = []
    pushRecommendedIntegrationsCheck(checks, null)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe(ROW_NAME)
    expect(checks[0].status).toBe('skip')
    expect(checks[0].detail).toContain('absent')
  })

  it('emits skip row with recommendation when claude-mem is NOT installed', () => {
    const checks: Check[] = []
    pushRecommendedIntegrationsCheck(checks, makePayload([]))
    // Should emit at least one skip row for the memory category
    const memRow = checks.find((c) => c.detail.includes('memory'))
    expect(memRow).toBeDefined()
    expect(memRow?.status).toBe('skip')
    expect(memRow?.name).toBe(ROW_NAME)
    expect(memRow?.detail).toContain('claude-mem')
  })

  it('emits pass row when claude-mem IS installed', () => {
    const checks: Check[] = []
    pushRecommendedIntegrationsCheck(checks, makePayload(['claude-mem']))
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe(ROW_NAME)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('all recommended integrations present')
  })

  it('never emits warn or fail — only skip or pass', () => {
    const scenarios = [
      null,
      makePayload([]),
      makePayload(['claude-mem']),
      makePayload(['other']),
    ]
    for (const payload of scenarios) {
      const checks: Check[] = []
      pushRecommendedIntegrationsCheck(checks, payload)
      for (const check of checks) {
        expect(['skip', 'pass']).toContain(check.status)
      }
    }
  })

  it('skip row includes docUrl when available', () => {
    const checks: Check[] = []
    pushRecommendedIntegrationsCheck(checks, makePayload([]))
    const skipRow = checks.find(
      (c) => c.status === 'skip' && c.detail.includes('claude-mem'),
    )
    expect(skipRow?.detail).toContain('see ')
  })

  it('other plugins installed — still recommends claude-mem (memory gap remains)', () => {
    const checks: Check[] = []
    pushRecommendedIntegrationsCheck(
      checks,
      makePayload(['superpowers', 'anvil']),
    )
    // No memory plugin installed → memory gap should still appear
    const memRow = checks.find((c) => c.detail.includes('memory'))
    expect(memRow).toBeDefined()
    expect(memRow?.status).toBe('skip')
  })
})
