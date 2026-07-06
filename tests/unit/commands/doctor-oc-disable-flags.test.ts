import { describe, expect, it } from 'vitest'
import { pushOcDisableFlagsCheck } from '../../../src/commands/cli/doctor.js'

interface Check {
  name: string
  status: string
  detail: string
}

const ROW_NAME = 'OC disable-flags (OPENCODE_DISABLE_*)'

describe('pushOcDisableFlagsCheck', () => {
  it('passes when no OPENCODE_DISABLE_* flags are set', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, {})
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe(ROW_NAME)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('no OPENCODE_DISABLE_*')
  })

  it('warns when OPENCODE_DISABLE_EXTERNAL_SKILLS is set', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, { OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' })
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe(ROW_NAME)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('OPENCODE_DISABLE_EXTERNAL_SKILLS')
  })

  it('warns when OPENCODE_DISABLE_CLAUDE_CODE is set', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, { OPENCODE_DISABLE_CLAUDE_CODE: '1' })
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('OPENCODE_DISABLE_CLAUDE_CODE')
  })

  it('detects arbitrary OPENCODE_DISABLE_FOO wildcard flags', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, { OPENCODE_DISABLE_FOO: 'true' })
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('OPENCODE_DISABLE_FOO')
  })

  it('reports count and all flags when multiple are set', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, {
      OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
      OPENCODE_DISABLE_CLAUDE_CODE: '1',
      OPENCODE_DISABLE_FOO: '1',
    })
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('3 disable-flag(s)')
    expect(checks[0].detail).toContain('OPENCODE_DISABLE_EXTERNAL_SKILLS')
    expect(checks[0].detail).toContain('OPENCODE_DISABLE_CLAUDE_CODE')
    expect(checks[0].detail).toContain('OPENCODE_DISABLE_FOO')
  })

  it('includes remediation hint in warn detail', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, { OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' })
    expect(checks[0].detail).toContain('unset')
  })

  it('ignores vars that start with OPENCODE_DISABLE_ but are empty string', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, { OPENCODE_DISABLE_EXTERNAL_SKILLS: '' })
    expect(checks[0].status).toBe('pass')
  })

  it('treats falsy values (0/false/no/off) as not-set', () => {
    for (const value of ['0', 'false', 'FALSE', 'no', 'off']) {
      const checks: Check[] = []
      pushOcDisableFlagsCheck(checks, {
        OPENCODE_DISABLE_EXTERNAL_SKILLS: value,
      })
      expect(checks[0].status, `value=${value}`).toBe('pass')
    }
  })

  it('known flags appear before unknown flags in the list', () => {
    const checks: Check[] = []
    pushOcDisableFlagsCheck(checks, {
      OPENCODE_DISABLE_ZZUNKNOWN: '1',
      OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    })
    expect(checks[0].status).toBe('warn')
    const detail = checks[0].detail
    const externalIdx = detail.indexOf('OPENCODE_DISABLE_EXTERNAL_SKILLS')
    const unknownIdx = detail.indexOf('OPENCODE_DISABLE_ZZUNKNOWN')
    expect(externalIdx).toBeLessThan(unknownIdx)
  })
})
