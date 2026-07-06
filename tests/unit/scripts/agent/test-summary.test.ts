import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type TestSummary,
  type TestSummaryDeps,
  loadTestSummary,
} from '../../../../scripts/agent/test-summary.js'

const FIXTURES = join(import.meta.dirname, '../../../fixtures/vitest-reports')

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8')
}

function makeDeps(overrides: Partial<TestSummaryDeps> = {}): TestSummaryDeps {
  return {
    now: () => 0,
    readCache: () => null,
    writeCache: () => undefined,
    runVitest: () => ({ stdout: '', stderr: '', exitCode: 1 }),
    ...overrides,
  }
}

describe('loadTestSummary', () => {
  it('parses pass-only fixture correctly', () => {
    const raw = readFixture('pass-only.json')
    const result = loadTestSummary(makeDeps({ readCache: () => raw }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const s = result as TestSummary
    expect(s.pass).toBe(10)
    expect(s.fail).toBe(0)
    expect(s.skip).toBe(0)
    expect(s.failures).toEqual([])
    expect(s.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('parses with-failures fixture correctly', () => {
    const raw = readFixture('with-failures.json')
    const result = loadTestSummary(makeDeps({ readCache: () => raw }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const s = result as TestSummary
    expect(s.pass).toBe(8)
    expect(s.fail).toBe(2)
    expect(s.failures).toHaveLength(2)
    expect(s.failures[0]?.message).toBe('Expected 1 to be 2')
    expect(s.failures[1]?.message).toContain('TypeError')
  })

  it('calls runVitest when cache returns null', () => {
    const raw = readFixture('pass-only.json')
    let vitestCalled = false
    const result = loadTestSummary(
      makeDeps({
        readCache: () => null,
        runVitest: () => {
          vitestCalled = true
          return { stdout: raw, stderr: '', exitCode: 0 }
        },
      }),
    )
    expect(vitestCalled).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('returns ok: false when vitest exits non-zero with no output', () => {
    const result = loadTestSummary(
      makeDeps({
        readCache: () => null,
        runVitest: () => ({ stdout: '', stderr: 'fatal', exitCode: 1 }),
      }),
    )
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain(
      'vitest exited',
    )
  })

  it('returns ok: false when JSON is invalid', () => {
    const result = loadTestSummary(makeDeps({ readCache: () => 'not-json{' }))
    expect(result.ok).toBe(false)
  })

  it('writes cache after successful vitest run', () => {
    const raw = readFixture('pass-only.json')
    let written = ''
    loadTestSummary(
      makeDeps({
        readCache: () => null,
        runVitest: () => ({ stdout: raw, stderr: '', exitCode: 0 }),
        writeCache: (_path, content) => {
          written = content
        },
      }),
    )
    // writeCache receives the trimmed stdout
    expect(written).toBe(raw.trim())
  })
})
