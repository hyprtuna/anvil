/**
 * ANV-0056 — Unit tests for the "SessionStart context budget" doctor row.
 *
 * Exercises pushSessionStartBudgetCheck in isolation by mocking
 * getSessionStartOverrunLogPath + fs.readFileSync + fs.existsSync.
 */
import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

vi.mock('../../../src/hooks/dispatcher.js', () => ({
  getSessionStartOverrunLogPath: vi.fn(
    () => '/fake-home/.anvil/logs/session-start-overruns.jsonl',
  ),
}))

// Import after mocks are set up
import { pushSessionStartBudgetCheck } from '../../../src/commands/cli/doctor.js'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

function makeEntry(
  overrides: {
    droppedCount?: number
    includedCount?: number
    budgetChars?: number
    usedChars?: number
  } = {},
): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    budgetChars: overrides.budgetChars ?? 6000,
    usedChars: overrides.usedChars ?? 5000,
    includedCount: overrides.includedCount ?? 2,
    droppedCount: overrides.droppedCount ?? 1,
  })
}

describe('pushSessionStartBudgetCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports skip when overrun log does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    const checks: Array<{
      name: string
      status: string
      detail: string
      expectedAbsence?: boolean
    }> = []
    await pushSessionStartBudgetCheck(checks)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('SessionStart context budget')
    expect(checks[0].status).toBe('skip')
    expect(checks[0].detail).toMatch(/not found|no data/)
    // ANV-0158: suppress in quiet mode when log is absent (no truncations yet).
    expect(checks[0].expectedAbsence).toBe(true)
  })

  it('reports warn when overrun entries exist', async () => {
    mockExistsSync.mockReturnValue(true)
    const lines = [
      makeEntry({ droppedCount: 1 }),
      makeEntry({ droppedCount: 2 }),
    ]
    mockReadFileSync.mockReturnValue(`${lines.join('\n')}\n`)
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushSessionStartBudgetCheck(checks)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('SessionStart context budget')
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toMatch(/truncation/)
  })

  it('includes avg dropped fragment count in detail', async () => {
    mockExistsSync.mockReturnValue(true)
    const lines = [
      makeEntry({ droppedCount: 2 }),
      makeEntry({ droppedCount: 4 }),
    ]
    mockReadFileSync.mockReturnValue(`${lines.join('\n')}\n`)
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushSessionStartBudgetCheck(checks)
    // avg dropped = (2+4)/2 = 3.0
    expect(checks[0].detail).toContain('3.0 fragment(s) dropped')
  })

  it('reports skip when log is empty', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('\n')
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushSessionStartBudgetCheck(checks)
    expect(checks[0].status).toBe('skip')
    expect(checks[0].detail).toMatch(/no valid entries/)
  })

  it('reads at most the last 10 entries', async () => {
    mockExistsSync.mockReturnValue(true)
    // Write 15 entries; row should only process last 10
    const lines = Array.from({ length: 15 }, () =>
      makeEntry({ droppedCount: 1 }),
    )
    mockReadFileSync.mockReturnValue(`${lines.join('\n')}\n`)
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushSessionStartBudgetCheck(checks)
    expect(checks[0].status).toBe('warn')
    // detail should reference "last 10"
    expect(checks[0].detail).toContain('10')
  })
})
