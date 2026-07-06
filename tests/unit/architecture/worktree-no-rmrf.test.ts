import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ANV-0155 — Architecture guard: worktree.ts must never use rm/rmSync/rmdirSync
 * or shell: true. All worktree teardown must go through `git worktree remove`.
 *
 * This test locks the "never rm -rf a worktree" hard rule from the plan.
 */
describe('architecture: worktree.ts no-rmrf guard', () => {
  // ANV-0182: worktree command relocated from src/commands/cli/ to scripts/dev/
  const worktreeCliPath = join(
    import.meta.url.replace('file://', '').replace(/\/tests\/.*$/, ''),
    'scripts',
    'dev',
    'worktree.ts',
  )

  let content: string

  try {
    content = readFileSync(worktreeCliPath, 'utf-8')
  } catch {
    throw new Error(`Could not read ${worktreeCliPath}`)
  }

  it('does not use fs.rm (forbidden — use git worktree remove)', () => {
    // Allow rmSync only in imports, not in logic
    const lines = content
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    const hasRm = lines.some(
      (l) =>
        /\bfs\.rm\b/.test(l) || /\brmSync\b/.test(l) || /\brmdirSync\b/.test(l),
    )
    expect(hasRm, 'worktree.ts must not use fs.rm/rmSync/rmdirSync').toBe(false)
  })

  it('does not use execSync with rm (forbidden — use spawnSync + git)', () => {
    const hasExecRm = /execSync.*\brm\b/.test(content)
    expect(hasExecRm, 'worktree.ts must not use execSync with rm').toBe(false)
  })

  it('does not use shell: true (forbidden — prevents injection)', () => {
    // shell: true is banned in worktree.ts
    const hasShellTrue = /shell:\s*true/.test(content)
    expect(
      hasShellTrue,
      'worktree.ts must not use shell: true — all git calls must use shell: false',
    ).toBe(false)
  })

  it('uses shell: false for all spawnSync calls', () => {
    // Every spawnSync call must have shell: false
    const spawnSyncCallCount = (content.match(/spawnSync\(/g) ?? []).length
    const shellFalseCount = (content.match(/shell:\s*false/g) ?? []).length
    // At minimum one spawnSync call must exist, and shell: false must appear
    expect(spawnSyncCallCount).toBeGreaterThan(0)
    expect(shellFalseCount).toBeGreaterThan(0)
  })
})
