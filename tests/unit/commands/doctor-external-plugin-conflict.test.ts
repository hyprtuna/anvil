import { describe, expect, it } from 'vitest'
import { pushExternalPluginConflictCheck } from '../../../src/commands/cli/doctor.js'

interface Check {
  name: string
  status: string
  detail: string
}

const ROW_NAME = 'External plugin conflicts'

/** Build a minimal valid v2 installed_plugins.json payload. */
function makePayload(slugs: string[]): unknown {
  const plugins: Record<string, unknown> = {}
  for (const slug of slugs) {
    plugins[`${slug}@user`] = [{ scope: 'user' }]
  }
  return { version: 2, plugins }
}

describe('pushExternalPluginConflictCheck', () => {
  it('skips when payload is null (file absent)', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(checks, null)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe(ROW_NAME)
    expect(checks[0].status).toBe('skip')
    expect(checks[0].detail).toContain('absent')
  })

  it('passes (zero hits) for malformed/non-v2 manifest — no false positives', () => {
    // tryReadJson collapses malformed JSON to null at the call site; when a
    // non-null non-v2 payload arrives (e.g. v1 schema), extractCcInstalledSlugs
    // returns [] so no conflicts are detected. The isCcUserWired check upstream
    // already flags a malformed manifest separately.
    const checks: Check[] = []
    pushExternalPluginConflictCheck(checks, {
      version: 1,
      plugins: { 'superpowers@user': [] },
    })
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('pass')
  })

  it('passes when installed plugins have no conflicts', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(
      checks,
      makePayload(['safe-plugin', 'anvil']),
    )
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe(ROW_NAME)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('no conflicts detected')
  })

  it('passes when payload has no plugins (empty registry)', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(checks, makePayload([]))
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('pass')
  })

  it('warns (default severity) when a conflicting plugin is installed', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(checks, makePayload(['superpowers']))
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe(ROW_NAME)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('superpowers')
  })

  it('emits one row per conflict when multiple conflicting plugins installed', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(
      checks,
      makePayload(['superpowers', 'claude-hud', 'safe-plugin']),
    )
    // 2 conflict hits → 2 rows
    expect(checks).toHaveLength(2)
    expect(checks.every((c) => c.name === ROW_NAME)).toBe(true)
    expect(checks.every((c) => c.status === 'warn')).toBe(true)
    const details = checks.map((c) => c.detail)
    expect(details.some((d) => d.includes('superpowers'))).toBe(true)
    expect(details.some((d) => d.includes('claude-hud'))).toBe(true)
  })

  it('escalates to fail when severity is "fail"', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(
      checks,
      makePayload(['block-no-verify']),
      'fail',
    )
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('block-no-verify')
  })

  it('includes count of checked plugins in pass detail', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(
      checks,
      makePayload(['plugin-a', 'plugin-b', 'plugin-c']),
    )
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('3 installed plugin(s)')
  })

  it('includes conflict reason in warn detail', () => {
    const checks: Check[] = []
    pushExternalPluginConflictCheck(checks, makePayload(['superpowers']))
    expect(checks[0].detail).toContain('SessionStart')
  })

  it('claude-mem does NOT produce a conflict row ( reclassification)', () => {
    // claude-mem is a recommended integration, not a conflict.
    // Asserting here guarantees no regression if someone re-adds it to KNOWN_CONFLICTS.
    const checks: Check[] = []
    pushExternalPluginConflictCheck(checks, makePayload(['claude-mem']))
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('pass')
    const detail = checks[0].detail
    expect(detail).not.toContain('claude-mem')
    // The pass detail says "no conflicts detected" — that's fine; we just
    // want to confirm there is no conflict *hit* for claude-mem.
    expect(detail).toContain('no conflicts detected')
  })

  it('adding a registry entry produces detection on next run (registry update test)', () => {
    // Validates AC: "Adding a conflict to the registry produces detection on the next doctor run."
    // We verify this by checking ALL 4 remaining seeded entries are detected.
    const conflictingSlugs = [
      'block-no-verify',
      'superpowers',
      'claude-hud',
      'autocomplete-pro',
    ]
    for (const slug of conflictingSlugs) {
      const checks: Check[] = []
      pushExternalPluginConflictCheck(checks, makePayload([slug]))
      expect(checks).toHaveLength(1)
      expect(checks[0].status, `slug '${slug}' should be detected`).toBe('warn')
    }
  })

  it('no false positives for common non-conflicting plugins', () => {
    const commonPlugins = [
      'anvil',
      'prettier',
      'eslint-helper',
      'my-custom-plugin',
      'test-runner',
    ]
    const checks: Check[] = []
    pushExternalPluginConflictCheck(checks, makePayload(commonPlugins))
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('pass')
  })
})
