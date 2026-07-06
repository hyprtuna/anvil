/**
 * ANV-0158 / ANV-0204 — Unit tests for expectedAbsence promotion of informational skip rows.
 *
 * Verifies that:
 *  1. SessionStart context budget: skip row carries expectedAbsence=true when
 *     the overrun log is absent (no truncations ever recorded).
 *  2. Hook latency budget: skip row carries expectedAbsence=true when the
 *     timings log is absent (no hooks dispatched yet).
 *  3. AGENTS.md routing block — null target + AGENTS.md without marker:
 *     skip row carries expectedAbsence=true.
 *  4. AGENTS.md routing block — CC-only target + AGENTS.md without marker:
 *     skip row carries expectedAbsence=true.
 *  5. When the condition changes (log exists / OC target): row is no longer
 *     suppressed (expectedAbsence is absent or false).
 *  6. ANV-0204: External plugin conflicts skip row carries expectedAbsence=true
 *     when ccInstalledPluginsPayload is null.
 *  7. ANV-0204: Recommended integrations skip row carries expectedAbsence=true
 *     when ccInstalledPluginsPayload is null.
 */

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mock setup for fs (used by hooks tests)
// ---------------------------------------------------------------------------

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

vi.mock('../../../../../src/hooks/dispatcher.js', () => ({
  getSessionStartOverrunLogPath: vi.fn(
    () => '/fake-home/.anvil/logs/session-start-overruns.jsonl',
  ),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

type CheckRow = {
  name: string
  status: string
  detail: string
  expectedAbsence?: boolean
}

// ---------------------------------------------------------------------------
// Lazy imports (after mocks)
// ---------------------------------------------------------------------------

describe('skip row expectedAbsence promotions', () => {
  // -------------------------------------------------------------------------
  // SessionStart context budget
  // -------------------------------------------------------------------------
  describe('pushSessionStartBudgetCheck', () => {
    it('skip row has expectedAbsence=true when overrun log is absent', async () => {
      mockExistsSync.mockReturnValue(false)
      const { pushSessionStartBudgetCheck } = await import(
        '../../../../../src/commands/cli/doctor-checks/hooks.js'
      )
      const checks: CheckRow[] = []
      await pushSessionStartBudgetCheck(checks)
      expect(checks).toHaveLength(1)
      expect(checks[0].status).toBe('skip')
      expect(checks[0].expectedAbsence).toBe(true)
    })

    it('warn row does NOT carry expectedAbsence when overrun log exists', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          droppedCount: 1,
        })}\n`,
      )
      const { pushSessionStartBudgetCheck } = await import(
        '../../../../../src/commands/cli/doctor-checks/hooks.js'
      )
      const checks: CheckRow[] = []
      await pushSessionStartBudgetCheck(checks)
      expect(checks).toHaveLength(1)
      expect(checks[0].status).toBe('warn')
      expect(checks[0].expectedAbsence).toBeFalsy()
    })
  })

  // -------------------------------------------------------------------------
  // Hook latency budget
  // -------------------------------------------------------------------------
  describe('pushHookLatencyBudgetCheck', () => {
    it('skip row has expectedAbsence=true when timings log is absent', async () => {
      mockExistsSync.mockReturnValue(false)
      const { pushHookLatencyBudgetCheck } = await import(
        '../../../../../src/commands/cli/doctor-checks/hooks.js'
      )
      const checks: CheckRow[] = []
      await pushHookLatencyBudgetCheck(checks)
      expect(checks).toHaveLength(1)
      expect(checks[0].name).toBe('Hook latency budget')
      expect(checks[0].status).toBe('skip')
      expect(checks[0].expectedAbsence).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // AGENTS.md routing block — null target (no manifest)
  // -------------------------------------------------------------------------
  describe('pushOcStandingInstructionsCheck — null target', () => {
    it('skip row has expectedAbsence=true when AGENTS.md is project-owned (no manifest)', async () => {
      // Mock existsSync: manifest absent, AGENTS.md present without marker.
      // readAnvilManifestTarget checks existsSync for manifest.json; when absent
      // it returns installedTarget=null which triggers the null-target path.
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p)
        if (path.endsWith('AGENTS.md')) return true
        return false
      })
      mockReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p)
        if (path.endsWith('AGENTS.md'))
          return '# Project AGENTS\n\nNo anvil marker here.\n'
        throw new Error(`unexpected readFileSync: ${path}`)
      })
      // readAnvilManifestTarget uses existsSync for manifest path.
      // Since manifest is absent (existsSync returns false), installedTarget=null.

      const { pushOcStandingInstructionsCheck } = await import(
        '../../../../../src/commands/cli/doctor-checks/plugin.js'
      )
      const checks: CheckRow[] = []
      await pushOcStandingInstructionsCheck(
        checks,
        '/fake/cwd',
        '/fake-home/.anvil',
      )
      const row = checks.find(
        (c) =>
          c.name === 'AGENTS.md routing block (OpenCode standing instructions)',
      )
      expect(row).toBeDefined()
      expect(row?.status).toBe('skip')
      expect(row?.detail).toContain('project-owned')
      expect(row?.expectedAbsence).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // ANV-0204: External plugin conflicts — null payload
  // -------------------------------------------------------------------------
  describe('pushExternalPluginConflictCheck — null payload', () => {
    it('skip row has expectedAbsence=true when ccInstalledPluginsPayload is null', async () => {
      const { pushExternalPluginConflictCheck } = await import(
        '../../../../../src/commands/cli/doctor-checks/plugin.js'
      )
      const checks: CheckRow[] = []
      pushExternalPluginConflictCheck(checks, null)
      expect(checks).toHaveLength(1)
      expect(checks[0].status).toBe('skip')
      expect(checks[0].expectedAbsence).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // ANV-0204: Recommended integrations — null payload
  // -------------------------------------------------------------------------
  describe('pushRecommendedIntegrationsCheck — null payload', () => {
    it('skip row has expectedAbsence=true when ccInstalledPluginsPayload is null', async () => {
      const { pushRecommendedIntegrationsCheck } = await import(
        '../../../../../src/commands/cli/doctor-checks/plugin.js'
      )
      const checks: CheckRow[] = []
      pushRecommendedIntegrationsCheck(checks, null)
      expect(checks).toHaveLength(1)
      expect(checks[0].status).toBe('skip')
      expect(checks[0].expectedAbsence).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // AGENTS.md routing block — CC-only target
  // -------------------------------------------------------------------------
  describe('pushOcStandingInstructionsCheck — CC-only target', () => {
    it('skip row has expectedAbsence=true when CC-only install + AGENTS.md without marker', async () => {
      // Manifest present with target=claude-code; AGENTS.md present without marker.
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p)
        if (path.endsWith('AGENTS.md')) return true
        if (path.endsWith('manifest.json')) return true
        return false
      })
      mockReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p)
        if (path.endsWith('AGENTS.md'))
          return '# Project AGENTS\n\nNo anvil marker here.\n'
        if (path.endsWith('manifest.json'))
          return JSON.stringify({ target: 'claude-code' })
        throw new Error(`unexpected readFileSync: ${path}`)
      })

      const { pushOcStandingInstructionsCheck } = await import(
        '../../../../../src/commands/cli/doctor-checks/plugin.js'
      )
      const checks: CheckRow[] = []
      await pushOcStandingInstructionsCheck(
        checks,
        '/fake/cwd',
        '/fake-home/.anvil',
      )
      const row = checks.find(
        (c) =>
          c.name === 'AGENTS.md routing block (OpenCode standing instructions)',
      )
      expect(row).toBeDefined()
      expect(row?.status).toBe('skip')
      expect(row?.detail).toContain('project-owned')
      expect(row?.expectedAbsence).toBe(true)
    })
  })
})
