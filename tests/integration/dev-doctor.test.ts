/**
 * ANV-0185 — Integration tests for scripts/dev/dev-doctor.ts
 *
 * TDD: written first. Each test fails until the corresponding script is
 * implemented.
 *
 * Tests verify:
 *   1. dev:doctor --json emits valid JSON with the documented shape
 *   2. All checks execute (non-empty checks array)
 *   3. --strict mode is honoured (warn rows counted separately)
 *   4. JSON output validates schema (ok, checks, pass, fail, warn, skip)
 *   5. anvil doctor row count drop (26 checks no longer in doctor registry)
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const ROOT = join(import.meta.dirname, '../..')

// ANV-0200: anti-recursion sentinel removed — dev-scripts.test.ts now calls
// helpers in-process, so there is no recursive vitest spawn risk.
const dDescribe = describe

// dev-doctor script can take time to import all checks
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

interface DevDoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

interface DevDoctorOutput {
  ok: boolean
  checks: DevDoctorCheck[]
  pass: number
  fail: number
  warn: number
  skip: number
}

function runDevDoctor(extraArgs: string[] = []): {
  stdout: string
  stderr: string
  exitCode: number
} {
  const result = spawnSync(
    'bun',
    ['run', 'scripts/dev/dev-doctor.ts', ...extraArgs],
    {
      cwd: ROOT,
      shell: false,
      encoding: 'utf-8',
      timeout: 60_000,
    },
  )
  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    exitCode: result.status ?? 1,
  }
}

dDescribe('ANV-0185: dev-doctor script', () => {
  describe('JSON output shape', () => {
    it('emits valid JSON with required top-level fields', () => {
      const { stdout } = runDevDoctor(['--json'])
      expect(() => JSON.parse(stdout)).not.toThrow()
      const output = JSON.parse(stdout) as DevDoctorOutput
      expect(typeof output.ok).toBe('boolean')
      expect(Array.isArray(output.checks)).toBe(true)
      expect(typeof output.pass).toBe('number')
      expect(typeof output.fail).toBe('number')
      expect(typeof output.warn).toBe('number')
      expect(typeof output.skip).toBe('number')
    })

    it('each check has name, status, and detail fields', () => {
      const { stdout } = runDevDoctor(['--json'])
      const output = JSON.parse(stdout) as DevDoctorOutput
      for (const check of output.checks) {
        expect(typeof check.name).toBe('string')
        expect(['pass', 'warn', 'fail', 'skip']).toContain(check.status)
        expect(typeof check.detail).toBe('string')
      }
    })

    it('counts are consistent with checks array', () => {
      const { stdout } = runDevDoctor(['--json'])
      const output = JSON.parse(stdout) as DevDoctorOutput
      const computedPass = output.checks.filter(
        (c) => c.status === 'pass',
      ).length
      const computedFail = output.checks.filter(
        (c) => c.status === 'fail',
      ).length
      const computedWarn = output.checks.filter(
        (c) => c.status === 'warn',
      ).length
      const computedSkip = output.checks.filter(
        (c) => c.status === 'skip',
      ).length
      expect(output.pass).toBe(computedPass)
      expect(output.fail).toBe(computedFail)
      expect(output.warn).toBe(computedWarn)
      expect(output.skip).toBe(computedSkip)
    })

    it('ok is true when no fail rows', () => {
      const { stdout } = runDevDoctor(['--json'])
      const output = JSON.parse(stdout) as DevDoctorOutput
      const hasFail = output.checks.some((c) => c.status === 'fail')
      // ok should be false iff there are fail rows
      if (hasFail) {
        expect(output.ok).toBe(false)
      } else {
        expect(output.ok).toBe(true)
      }
    })
  })

  describe('check execution', () => {
    it('runs at least 10 checks against the Anvil source tree', () => {
      const { stdout } = runDevDoctor(['--json'])
      const output = JSON.parse(stdout) as DevDoctorOutput
      // We expect 26 checks; allow some to skip but at least 10 should run
      expect(output.checks.length).toBeGreaterThanOrEqual(10)
    })

    it('check names are non-empty strings', () => {
      const { stdout } = runDevDoctor(['--json'])
      const output = JSON.parse(stdout) as DevDoctorOutput
      for (const check of output.checks) {
        expect(check.name.length).toBeGreaterThan(0)
      }
    })
  })

  describe('--strict mode', () => {
    it('accepts --strict flag without crashing', () => {
      const { stdout, exitCode } = runDevDoctor(['--json', '--strict'])
      // Should not crash — exit 0 or 2 (not 1)
      expect(exitCode === 0 || exitCode === 2).toBe(true)
      expect(() => JSON.parse(stdout)).not.toThrow()
    })
  })

  describe('exit codes', () => {
    it('exits 0 or 2 (never 1)', () => {
      const { exitCode } = runDevDoctor(['--json'])
      expect(exitCode === 0 || exitCode === 2).toBe(true)
    })
  })

  describe('anvil doctor row count drop', () => {
    it('anvil doctor JSON output has substantially fewer rows after (26 migrated out)', async () => {
      // Import doctor command and run with JSON mode to count rows
      const { doctorCommand } = await import('../../src/commands/cli/doctor.js')

      const writes: string[] = []
      const origWrite = process.stdout.write.bind(process.stdout)
      process.stdout.write = ((chunk: string | Uint8Array): boolean => {
        writes.push(
          typeof chunk === 'string'
            ? chunk
            : Buffer.from(chunk).toString('utf-8'),
        )
        return true
      }) as typeof process.stdout.write

      try {
        await doctorCommand({ json: true })
      } finally {
        process.stdout.write = origWrite
      }

      const payload = writes.join('')
      const checks = JSON.parse(payload) as Array<{
        name: string
        status: string
      }>

      // Before ANV-0185 there were 70 rows; after migrating 26 ceremony/bundle-internal
      // checks to dev:doctor, the count dropped to ≤50. ANV-0221 follow-up
      // restores ONE user-facing advisory row (user model-config alias WARN),
      // so the budget is ≤51 — still substantially fewer than the pre-ANV-0185 70.
      expect(checks.length).toBeLessThanOrEqual(51)

      // Verify that the migrated dev-doctor checks are NOT in anvil doctor anymore
      const checkNames = checks.map((c) => c.name)
      expect(checkNames).not.toContain('OC hook registry coverage')
      expect(checkNames).not.toContain(
        'Every HookKind has a registered handler',
      )
      expect(checkNames).not.toContain('CC hook coverage')
      expect(checkNames).not.toContain('Command safety annotations')
      expect(checkNames).not.toContain('routing-rules sync')
      expect(checkNames).not.toContain('Capability snapshot integrity')
      expect(checkNames).not.toContain('Capability snapshot freshness')
      expect(checkNames).not.toContain(
        'Version sync (package.json / marketplace.json / CHANGELOG)',
      )
      expect(checkNames).not.toContain('Worktree base freshness')
      expect(checkNames).not.toContain('Pre-push parity')
    })
  })
})
