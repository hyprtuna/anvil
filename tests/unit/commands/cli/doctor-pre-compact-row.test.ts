/**
 * Tests for the buildPreCompactHandlerWiredRow doctor helper (ANV-0126).
 */
import { describe, expect, it } from 'vitest'
import { buildPreCompactHandlerWiredRow } from '../../../../src/commands/cli/doctor.js'

describe('buildPreCompactHandlerWiredRow', () => {
  it('returns pass when wired and not disabled', () => {
    const row = buildPreCompactHandlerWiredRow({
      hasHandler: true,
      env: {},
      config: undefined,
    })
    expect(row.status).toBe('pass')
    expect(row.detail).toContain('wired')
  })

  it('returns fail when handler is not registered', () => {
    const row = buildPreCompactHandlerWiredRow({
      hasHandler: false,
      env: {},
      config: undefined,
    })
    expect(row.status).toBe('fail')
  })

  it('returns warn when disabled by env', () => {
    const row = buildPreCompactHandlerWiredRow({
      hasHandler: true,
      env: { ANVIL_DISABLE_PRE_COMPACT: '1' },
      config: undefined,
    })
    expect(row.status).toBe('warn')
    expect(row.detail).toContain('env')
  })

  it('returns warn when disabled by config', () => {
    const row = buildPreCompactHandlerWiredRow({
      hasHandler: true,
      env: {},
      config: { pre_compact: { disable: true } },
    })
    expect(row.status).toBe('warn')
    expect(row.detail).toContain('config')
  })

  it('name includes the ticket reference', () => {
    const row = buildPreCompactHandlerWiredRow({
      hasHandler: true,
      env: {},
      config: undefined,
    })
    expect(row.name).toContain('ANV-0126')
  })
})
