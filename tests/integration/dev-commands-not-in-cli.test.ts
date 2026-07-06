/**
 * ANV-0182 — Guard that the 4 dev-only commands (release, worktree, pr-branch,
 * skill eval) are NOT registered in the user-facing `anvil` binary.
 *
 * TDD: this test is written first (Step 1 of ANV-0182). It asserts the
 * post-move state. Run before the move to confirm it currently fails; run
 * after the move to confirm it passes.
 */

import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binPath = join(__dirname, '..', '..', 'bin', 'anvil.cjs')

function runAnvil(args: string): {
  stdout: string
  stderr: string
  code: number
} {
  try {
    const stdout = execSync(`node ${binPath} ${args}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { stdout, stderr: '', code: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: e.status ?? 1,
    }
  }
}

describe('dev-only commands removed from user CLI', () => {
  it('anvil release exits non-zero with unknown-command message', () => {
    const result = runAnvil('release 0.0.0 --dry-run')
    expect(result.code).not.toBe(0)
    const combined = (result.stdout + result.stderr).toLowerCase()
    expect(combined).toMatch(/unknown command|error/i)
  })

  it('anvil worktree exits non-zero with unknown-command message', () => {
    const result = runAnvil('worktree create ANV-9999')
    expect(result.code).not.toBe(0)
    const combined = (result.stdout + result.stderr).toLowerCase()
    expect(combined).toMatch(/unknown command|error/i)
  })

  it('anvil pr-branch exits non-zero with unknown-command message', () => {
    const result = runAnvil('pr-branch --dry-run')
    expect(result.code).not.toBe(0)
    const combined = (result.stdout + result.stderr).toLowerCase()
    expect(combined).toMatch(/unknown command|error/i)
  })

  it('anvil skill eval exits non-zero with unknown-command message', () => {
    const result = runAnvil('skill eval some-skill')
    expect(result.code).not.toBe(0)
    const combined = (result.stdout + result.stderr).toLowerCase()
    expect(combined).toMatch(/unknown command|error/i)
  })

  it('anvil --help does NOT list release, worktree, pr-branch', () => {
    const result = runAnvil('--help')
    expect(result.code).toBe(0)
    // None of the dev-only top-level commands should appear in help
    expect(result.stdout).not.toMatch(/^\s+release\s/m)
    expect(result.stdout).not.toMatch(/^\s+worktree\s/m)
    expect(result.stdout).not.toMatch(/^\s+pr-branch\s/m)
  })

  it('anvil skill --help does NOT list eval subcommand', () => {
    const result = runAnvil('skill --help')
    expect(result.code).toBe(0)
    expect(result.stdout).not.toMatch(/^\s+eval\s/m)
  })
})
