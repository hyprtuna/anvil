import { describe, expect, it } from 'vitest'
import { pushHookKindCoverageCheck } from '../../../../src/commands/cli/doctor.js'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookKind } from '../../../../src/core/types.js'
import { loadAllHooks } from '../../../../src/hooks/load-all.js'

// Minimal config that enables all hooks (no disabled kinds)
const baseConfig = buildDefaultConfig()
const allEnabledConfig = {
  ...baseConfig,
  disabled: { ...baseConfig.disabled, hooks: [] as HookKind[] },
}

describe('doctor row: Every HookKind has a registered handler', () => {
  it('passes on a clean tree — every HookKind value has a registered handler', async () => {
    const registry = loadAllHooks({ config: allEnabledConfig })
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushHookKindCoverageCheck(
      checks,
      HookKind.options,
      registry.getAll().map((h) => h.kind),
    )
    expect(checks).toHaveLength(1)
    const row = checks[0]
    expect(row.name).toBe('Every HookKind has a registered handler')
    expect(row.status).toBe('pass')
    expect(row.detail).toMatch(/all \d+ kinds registered/)
  })

  it('fails when a synthetic kind has no registration', async () => {
    const registry = loadAllHooks({ config: allEnabledConfig })
    const registered = registry.getAll().map((h) => h.kind)
    // Introduce a fake kind that has no handler
    const syntheticKinds = [...HookKind.options, 'fake-kind' as HookKind]
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushHookKindCoverageCheck(checks, syntheticKinds, registered)
    expect(checks).toHaveLength(1)
    const row = checks[0]
    expect(row.status).toBe('fail')
    expect(row.detail).toContain('fake-kind')
  })

  it('detail message on failure names each missing kind explicitly', async () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    // Two synthetic missing kinds
    const syntheticKinds = [
      ...HookKind.options,
      'ghost-a' as HookKind,
      'ghost-b' as HookKind,
    ]
    const registered = loadAllHooks({ config: allEnabledConfig })
      .getAll()
      .map((h) => h.kind)
    await pushHookKindCoverageCheck(checks, syntheticKinds, registered)
    const row = checks[0]
    expect(row.status).toBe('fail')
    expect(row.detail).toContain('ghost-a')
    expect(row.detail).toContain('ghost-b')
    // Detail should also mention where to fix it
    expect(row.detail).toContain('load-all.ts')
  })
})
