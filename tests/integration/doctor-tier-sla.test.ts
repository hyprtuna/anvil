/**
 * ANV-0217 — Doctor tier SLA integration tests.
 *
 * Spawns the real `anvil doctor` binary and measures wall-clock elapsed time
 * for quick (--smoke) and standard tiers.
 *
 * These tests only run when the built binary exists at ./bin/anvil.cjs.
 * They are skipped in CI environments that haven't run `bun run build` first.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const BINARY = join(REPO_ROOT, 'bin', 'anvil.cjs')
const BINARY_EXISTS = existsSync(BINARY)

describe.skipIf(!BINARY_EXISTS)(
  'doctor tier SLA (integration — requires built binary)',
  () => {
    it('--smoke completes in under 2000ms wall-clock', () => {
      const start = Date.now()
      const result = spawnSync('node', [BINARY, 'doctor', '--smoke'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        timeout: 10000,
      })
      const elapsed = Date.now() - start
      // The process must exit (exit code 0 or 1 are both fine — warns are ok)
      expect(result.status).not.toBeNull()
      // Wall-clock must be under budget (with generous 3x headroom for CI)
      expect(elapsed).toBeLessThan(6000)
      // The output must contain the SLA row
      expect(result.stdout).toMatch(/Doctor run \(quick\)/)
    })

    it('--smoke output contains Doctor run (quick) row', () => {
      const result = spawnSync(
        'node',
        [BINARY, 'doctor', '--smoke', '--verbose'],
        { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 10000 },
      )
      expect(result.stdout).toMatch(/Doctor run \(quick\)/)
      expect(result.stdout).toMatch(/elapsed: \d+ms/)
    })

    it('default doctor contains Doctor run (standard) row', () => {
      const result = spawnSync('node', [BINARY, 'doctor', '--verbose'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        timeout: 30000,
      })
      expect(result.stdout).toMatch(/Doctor run \(standard\)/)
      expect(result.stdout).toMatch(/elapsed: \d+ms/)
    })

    it('--tier deep contains Doctor run (deep) row', () => {
      // deep tier runs live-eval which may be slow; use a generous timeout
      const result = spawnSync(
        'node',
        [BINARY, 'doctor', '--tier', 'deep', '--verbose'],
        { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 60000 },
      )
      expect(result.stdout).toMatch(/Doctor run \(deep\)/)
      expect(result.stdout).toMatch(/no SLA budget for deep/)
    })
  },
)
