import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { isInsideGitRepo } from '../../../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

/**
 * Plan 28 H4 — coverage for the doctor row that flags agent-runtime
 * preconditions. The end-to-end behaviour is exercised through
 * `doctor-full.test.ts`; here we only assert the load-bearing helper.
 */

// ANV-0163: canary — ensure no stray /tmp/.git pre-exists from a prior run.
it('canary: /tmp/.git must not pre-exist', () => {
  expect(existsSync(join(tmpdir(), '.git'))).toBe(false)
})

describe('commands/cli/doctor — agent runtime helpers', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('doctor-agent-rt')
  })

  afterAll(() => {
    // ANV-0163: defensive cleanup — remove any stray /tmp/.git left by a
    // fixture that failed to clean up (e.g., process kill before afterEach ran).
    rmSync(join(tmpdir(), '.git'), { recursive: true, force: true })
  })

  it('isInsideGitRepo returns false for a fresh tmp dir without .git', () => {
    expect(isInsideGitRepo(tmp)).toBe(false)
  })

  it('isInsideGitRepo returns true when .git is a sibling', () => {
    mkdirSync(join(tmp, '.git'))
    expect(isInsideGitRepo(tmp)).toBe(true)
  })

  it('isInsideGitRepo walks upward — finds .git in a parent', () => {
    mkdirSync(join(tmp, '.git'))
    const nested = join(tmp, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })
    expect(isInsideGitRepo(nested)).toBe(true)
  })
})
