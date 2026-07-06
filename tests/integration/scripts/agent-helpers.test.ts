/**
 * ANV-0156 — Integration tests for scripts/agent/* helpers.
 *
 * Spawns each helper as a child process and asserts:
 *   1. JSON shape is correct.
 *   2. Exit code is 0 (all helpers should succeed in a valid git repo).
 *   3. stderr is empty (no output unless --debug).
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../../..')

function runHelper(name: string): {
  stdout: string
  stderr: string
  exitCode: number
} {
  const result = spawnSync('bunx', ['tsx', `scripts/agent/${name}.ts`], {
    cwd: ROOT,
    shell: false,
    encoding: 'utf-8',
    timeout: 30000,
  })
  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    exitCode: result.status ?? 1,
  }
}

describe('scripts/agent/* integration', () => {
  it('branch-state.ts outputs valid JSON with correct shape', () => {
    const { stdout, stderr, exitCode } = runHelper('branch-state')
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    const json = JSON.parse(stdout) as Record<string, unknown>
    expect(json.ok).toBe(true)
    expect(typeof json.branch).toBe('string')
    expect(typeof json.base).toBe('string')
    expect(typeof json.ahead).toBe('number')
    expect(typeof json.behind).toBe('number')
    expect(typeof json.dirty).toBe('boolean')
    expect(typeof json.untracked).toBe('boolean')
    expect(typeof json.lastCommitSha).toBe('string')
    expect(typeof json.lastCommitSubject).toBe('string')
  })

  it('dirty-files.ts outputs valid JSON with correct shape', () => {
    const { stdout, stderr, exitCode } = runHelper('dirty-files')
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    const json = JSON.parse(stdout) as Record<string, unknown>
    expect(json.ok).toBe(true)
    expect(Array.isArray(json.modified)).toBe(true)
    expect(Array.isArray(json.staged)).toBe(true)
    expect(Array.isArray(json.untracked)).toBe(true)
  })

  it('branch-state.ts produces zero stderr in normal operation', () => {
    const { stderr } = runHelper('branch-state')
    expect(stderr).toBe('')
  })

  it('dirty-files.ts produces zero stderr in normal operation', () => {
    const { stderr } = runHelper('dirty-files')
    expect(stderr).toBe('')
  })

  it('stdout is a single JSON line (no extra newlines at end)', () => {
    const result = spawnSync('bunx', ['tsx', 'scripts/agent/branch-state.ts'], {
      cwd: ROOT,
      shell: false,
      encoding: 'utf-8',
      timeout: 30000,
    })
    const raw = result.stdout ?? ''
    // Should end with exactly one newline
    expect(raw.endsWith('\n')).toBe(true)
    // Should not end with two newlines
    expect(raw.endsWith('\n\n')).toBe(false)
  })
})
