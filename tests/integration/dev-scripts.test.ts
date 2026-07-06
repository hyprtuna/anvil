/**
 * ANV-0190 — Integration tests for scripts/dev/* automation scripts.
 * ANV-0200 — Rewritten to call helpers in-process (no subprocess vitest spawns).
 *
 * Tests call exported functions directly instead of spawning subprocesses.
 * This eliminates the subprocess chain that caused recursive vitest invocations
 * and the associated anti-recursion sentinel workaround.
 *
 * The dev:verify:skills and dev:verify:agents tests retain spawnSync because
 * they wrap `anvil` CLI invocations (out of scope for ANV-0200).
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { getCheckStatus } from '../../scripts/dev/check-status.js'
import { runTests } from '../../scripts/dev/test-agent.js'

const ROOT = join(import.meta.dirname, '../..')

// Per-file timeout: runTests() spawns vitest with a narrow pattern, which
// takes a few seconds. Default 10_000ms is too tight.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

// ---------------------------------------------------------------------------
// dev:status — tested in-process via getCheckStatus()
// ---------------------------------------------------------------------------

describe('dev-scripts integration', () => {
  describe('dev:status (in-process)', () => {
    it('returns object with all 5 top-level fields', async () => {
      const result = await getCheckStatus({ skipTests: true, skipGate: true })
      expect(result).toHaveProperty('ok', true)
      expect(result).toHaveProperty('branch')
      expect(result).toHaveProperty('dirty')
      expect(result).toHaveProperty('gate')
      expect(result).toHaveProperty('tests')
      expect(result).toHaveProperty('ticketCounter')
    })

    it('branch field matches branch-state shape', async () => {
      const result = await getCheckStatus({ skipTests: true, skipGate: true })
      if (!result.ok) throw new Error(result.error)
      const branch = result.branch as Record<string, unknown>
      expect(typeof branch.branch).toBe('string')
      expect(typeof branch.ahead).toBe('number')
      expect(typeof branch.behind).toBe('number')
    })

    it('dirty field matches dirty-files shape', async () => {
      const result = await getCheckStatus({ skipTests: true, skipGate: true })
      if (!result.ok) throw new Error(result.error)
      const dirty = result.dirty as Record<string, unknown>
      expect(Array.isArray(dirty.modified)).toBe(true)
      expect(Array.isArray(dirty.staged)).toBe(true)
      expect(Array.isArray(dirty.untracked)).toBe(true)
    })

    it('ticketCounter is a non-negative integer', async () => {
      const result = await getCheckStatus({ skipTests: true, skipGate: true })
      if (!result.ok) throw new Error(result.error)
      expect(typeof result.ticketCounter).toBe('number')
      expect(result.ticketCounter >= 0).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // dev:test — runTests() spawns vitest with a narrow pattern (no recursion risk
  // since the pattern is explicit and does not include this test file)
  // ---------------------------------------------------------------------------

  describe('dev:test (in-process via runTests)', () => {
    it('returns object with required fields', () => {
      const result = runTests('branch-state')
      expect(typeof result.ok).toBe('boolean')
      expect(typeof result.pass).toBe('number')
      expect(typeof result.fail).toBe('number')
      expect(typeof result.skip).toBe('number')
      expect(typeof result.durationMs).toBe('number')
      expect(Array.isArray(result.failures)).toBe(true)
    })

    it('--pattern lint-roots returns ok: true when tests pass', () => {
      const result = runTests('lint-roots')
      expect(result.ok).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // dev:verify:skills — retained as subprocess (wraps anvil CLI, out of scope)
  // ---------------------------------------------------------------------------

  describe('dev:verify:skills', () => {
    it('exits without crashing and emits JSON', () => {
      const result = spawnSync('bun', ['run', 'dev:verify:skills'], {
        cwd: ROOT,
        shell: false,
        encoding: 'utf-8',
        timeout: 30_000,
      })
      const stdout = (result.stdout ?? '').trim()
      const exitCode = result.status ?? 1
      // Exit code may be 0 or 2 depending on real skill state; 1 is unexpected
      expect(exitCode === 0 || exitCode === 2).toBe(true)
      const json = JSON.parse(stdout) as Record<string, unknown>
      expect(typeof json.ok).toBe('boolean')
    })

    it('produces no stderr in normal operation', () => {
      const result = spawnSync('bun', ['run', 'dev:verify:skills'], {
        cwd: ROOT,
        shell: false,
        encoding: 'utf-8',
        timeout: 30_000,
      })
      const rawStderr = (result.stderr ?? '').trim()
      const stderr = rawStderr
        .split('\n')
        .filter((line) => !line.startsWith('$'))
        .join('\n')
        .trim()
      expect(stderr).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // dev:verify:agents — retained as subprocess (wraps anvil CLI, out of scope)
  // ---------------------------------------------------------------------------

  describe('dev:verify:agents', () => {
    it('exits without crashing and emits JSON', () => {
      const result = spawnSync('bun', ['run', 'dev:verify:agents'], {
        cwd: ROOT,
        shell: false,
        encoding: 'utf-8',
        timeout: 30_000,
      })
      const stdout = (result.stdout ?? '').trim()
      const exitCode = result.status ?? 1
      // Exit code may be 0 or 2 depending on real agent state; 1 is unexpected
      expect(exitCode === 0 || exitCode === 2).toBe(true)
      const json = JSON.parse(stdout) as Record<string, unknown>
      expect(typeof json.ok).toBe('boolean')
    })

    it('produces no stderr in normal operation', () => {
      const result = spawnSync('bun', ['run', 'dev:verify:agents'], {
        cwd: ROOT,
        shell: false,
        encoding: 'utf-8',
        timeout: 30_000,
      })
      const rawStderr = (result.stderr ?? '').trim()
      const stderr = rawStderr
        .split('\n')
        .filter((line) => !line.startsWith('$'))
        .join('\n')
        .trim()
      expect(stderr).toBe('')
    })
  })
})
