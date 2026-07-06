import { describe, expect, it } from 'vitest'
import { pushContextManifestArtifactsCheck } from '../../../../../src/commands/cli/doctor-checks/context-manifest.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

describe('pushContextManifestArtifactsCheck', () => {
  it('passes when DEFAULT_PHASE_MANIFEST resolves cleanly', () => {
    const checks: Check[] = []
    pushContextManifestArtifactsCheck(checks, '/tmp/some/project')
    expect(checks).toHaveLength(1)
    const row = checks[0]
    expect(row?.name).toBe('phase-manifest artifacts resolve')
    expect(row?.status).toBe('pass')
    expect(row?.detail).toContain('token(s)')
  })

  it('detail mentions a positive count of referenced tokens', () => {
    const checks: Check[] = []
    pushContextManifestArtifactsCheck(checks, '/tmp')
    expect(checks[0]?.detail).toMatch(/\d+ token\(s\) referenced/)
  })
})
