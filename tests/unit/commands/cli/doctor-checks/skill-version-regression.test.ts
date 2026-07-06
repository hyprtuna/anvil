/**
 * ANV-0160 — Unit tests for skill version regression check using merge-base
 * instead of HEAD~1 (Fix B).
 *
 * Three cases:
 * 1. computeSkillVersionRegressions() detects a downgrade.
 * 2. All candidate refs fail → pushSkillVersionRegressionCheck skips with
 *    'no merge-base with release branch available'.
 * 3. RC-2: worktree branched off older commit where skill didn't exist →
 *    no false regression (status not 'fail').
 */

import { execSync } from 'node:child_process'
import {
  mkdirSync as fsMkdirSync,
  mkdtempSync as fsMkdtempSync,
  rmSync as fsRmSync,
  writeFileSync as fsWriteFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeSkillVersionRegressions,
  pushSkillVersionRegressionCheck,
} from '../../../../../src/commands/cli/doctor-checks/skill-checks.js'

type Check = {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
}

function git(args: string[], cwd: string): string {
  return execSync(
    `git ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
    {
      cwd,
      stdio: 'pipe',
      env: GIT_ENV,
      encoding: 'utf-8',
    },
  )
}

// ---------------------------------------------------------------------------
// Case 1: computeSkillVersionRegressions directly — regression detected
//
// This tests the pure logic (no git I/O). The git merge-base integration is
// tested in cases 2 and 3.
// ---------------------------------------------------------------------------

describe('computeSkillVersionRegressions — regression detection', () => {
  it('detects a version downgrade', () => {
    const regressions = computeSkillVersionRegressions([
      { name: 'test-skill', currentVersion: '0.9.0', priorVersion: '1.0.0' },
    ])
    expect(regressions).toHaveLength(1)
    expect(regressions[0]).toMatchObject({
      name: 'test-skill',
      current: '0.9.0',
      prior: '1.0.0',
    })
  })

  it('does not flag an upgrade', () => {
    const regressions = computeSkillVersionRegressions([
      { name: 'test-skill', currentVersion: '1.1.0', priorVersion: '1.0.0' },
    ])
    expect(regressions).toHaveLength(0)
  })

  it('does not flag an equal version', () => {
    const regressions = computeSkillVersionRegressions([
      { name: 'test-skill', currentVersion: '1.0.0', priorVersion: '1.0.0' },
    ])
    expect(regressions).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Case 2: all candidate refs fail → skip
//
// Build a repo where:
//   - initial branch name is 'feature' (no local 'main')
//   - no remote
//   - ANVIL_RELEASE_BRANCH set to a nonexistent branch
//   → all three candidates fail → skip
// ---------------------------------------------------------------------------

describe('pushSkillVersionRegressionCheck — all refs fail → skip', () => {
  let repoDir: string

  beforeEach(() => {
    repoDir = fsMkdtempSync(join(tmpdir(), 'anv-0160-c2-'))
    git(['init', '-b', 'feature'], repoDir)
    fsMkdirSync(join(repoDir, 'skills'), { recursive: true })
    // We need a skills dir to pass the existsSync check, even if no valid
    // skills load — the merge-base check happens after skills load.
    fsWriteFileSync(join(repoDir, 'skills', '.keep'), '')
    git(['add', '.'], repoDir)
    git(['commit', '-m', 'initial'], repoDir)
    git(['commit', '--allow-empty', '-m', 'bump'], repoDir)
  })

  afterEach(() => {
    fsRmSync(repoDir, { recursive: true, force: true })
  })

  it('skips with no-merge-base detail when all refs fail', async () => {
    const checks: Check[] = []
    const origBranch = process.env.ANVIL_RELEASE_BRANCH
    process.env.ANVIL_RELEASE_BRANCH = 'release/v999.999.999'
    try {
      await pushSkillVersionRegressionCheck(
        checks,
        repoDir,
        true,
        'upstream-skip',
      )
    } finally {
      if (origBranch !== undefined) {
        process.env.ANVIL_RELEASE_BRANCH = origBranch
      } else {
        // biome-ignore lint/performance/noDelete: restore unset-key state
        delete process.env.ANVIL_RELEASE_BRANCH
      }
    }
    const row = checks.find((c) => c.name === 'Skill version regression')
    expect(row).toBeDefined()
    expect(row?.status).toBe('skip')
    expect(row?.detail).toContain('no merge-base with release branch available')
  })
})

// ---------------------------------------------------------------------------
// Case 3 (RC-2 regression test): worktree branched off older commit where
// skill didn't exist yet → no false regression.
//
// Build:
//   "remote" repo: commit1 (no skills), commit2 (adds a skill)
//   "wt" repo: fetches remote, branches from commit1 (pre-skill), adds skill
//   merge-base(HEAD, origin/main) = commit1 → git show commit1:skills/... → 128
//   → skill treated as new → not a regression → status NOT 'fail'
// ---------------------------------------------------------------------------

describe('pushSkillVersionRegressionCheck — RC-2 no false regression', () => {
  let remoteDir: string
  let wtDir: string

  beforeEach(() => {
    remoteDir = fsMkdtempSync(join(tmpdir(), 'anv-0160-c3-remote-'))
    wtDir = fsMkdtempSync(join(tmpdir(), 'anv-0160-c3-wt-'))

    // Build remote repo: commit1 no skills, commit2 adds skill
    git(['init', '-b', 'main'], remoteDir)
    fsWriteFileSync(join(remoteDir, 'README.md'), 'hello')
    git(['add', '.'], remoteDir)
    git(['commit', '-m', 'commit1: no skills'], remoteDir)
    fsMkdirSync(join(remoteDir, 'skills'), { recursive: true })
    fsWriteFileSync(join(remoteDir, 'skills', '.keep'), '')
    git(['add', '.'], remoteDir)
    git(['commit', '-m', 'commit2: add skills dir'], remoteDir)

    // Build worktree repo branched from commit1 (pre-skills)
    git(['init', '-b', 'feature/work'], wtDir)
    git(['remote', 'add', 'origin', remoteDir], wtDir)
    git(['fetch', 'origin'], wtDir)
    // Branch from commit1 = origin/main~1
    execSync('git checkout -b feature/work origin/main~1', {
      cwd: wtDir,
      stdio: 'pipe',
      env: GIT_ENV,
    })
    // Worker adds skills dir in feature branch
    fsMkdirSync(join(wtDir, 'skills'), { recursive: true })
    fsWriteFileSync(join(wtDir, 'skills', '.keep'), '')
    git(['add', '.'], wtDir)
    git(['commit', '-m', 'feature: add skills'], wtDir)
  })

  afterEach(() => {
    fsRmSync(remoteDir, { recursive: true, force: true })
    fsRmSync(wtDir, { recursive: true, force: true })
  })

  it('RC-2: skill dir added after merge-base → no false regression', async () => {
    const checks: Check[] = []
    const origBranch = process.env.ANVIL_RELEASE_BRANCH
    // release/v0.13.4 won't exist in the remote repo → falls through to origin/main
    process.env.ANVIL_RELEASE_BRANCH = 'release/v0.13.4'
    try {
      await pushSkillVersionRegressionCheck(checks, wtDir, true, 'skip-detail')
    } finally {
      if (origBranch !== undefined) {
        process.env.ANVIL_RELEASE_BRANCH = origBranch
      } else {
        // biome-ignore lint/performance/noDelete: restore unset-key state
        delete process.env.ANVIL_RELEASE_BRANCH
      }
    }
    const row = checks.find((c) => c.name === 'Skill version regression')
    expect(row).toBeDefined()
    // Merge-base is commit1 (no skills) OR skip if no merge-base — either way NOT fail
    expect(row?.status).not.toBe('fail')
  })
})
