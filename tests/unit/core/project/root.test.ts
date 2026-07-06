import { execSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ProjectRootNotFoundError,
  resolveProjectRoot,
} from '../../../../src/core/project/root.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('core/project/root — resolveProjectRoot', () => {
  it('walks upward from cwd and finds .anvil/ (fast path)', async () => {
    const tmp = createTestTmpDir('anvil-root-fast')
    try {
      const repo = join(tmp, 'repo')
      const nested = join(repo, 'src', 'deep', 'nested')
      await mkdir(nested, { recursive: true })
      await mkdir(join(repo, '.anvil'), { recursive: true })
      // .git marker keeps the walk from escaping to an ancestor .anvil/ on
      // shared test hosts (e.g. /tmp/.anvil on a developer machine).
      await mkdir(join(repo, '.git'), { recursive: true })

      // The git runner must NEVER be called when fast path hits.
      let gitCalls = 0
      const got = await resolveProjectRoot(nested, {
        runGit: () => {
          gitCalls += 1
          return '/should-not-be-used/.git'
        },
      })
      expect(resolvePath(got)).toBe(resolvePath(repo))
      expect(gitCalls).toBe(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('falls back to git-common-dir when .anvil/ is not on the upward walk', async () => {
    const tmp = createTestTmpDir('anvil-root-gcd')
    try {
      const repo = join(tmp, 'repo')
      const worktree = join(tmp, 'worktrees', 'feat-x')
      // Linked worktree has no .anvil/ in its tree, but it has a .git file
      // (in a real worktree this is a file pointing back to the canonical
      // .git/worktrees/<name>/ entry; an empty marker is enough for the walk
      // to treat the worktree dir as a repo boundary).
      await mkdir(worktree, { recursive: true })
      await writeFile(join(worktree, '.git'), 'gitdir: /fake/path\n')
      // Canonical repo root holds the .anvil/ and a .git directory.
      await mkdir(join(repo, '.anvil'), { recursive: true })
      await mkdir(join(repo, '.git'), { recursive: true })

      const runGit = (args: readonly string[], cwd: string) => {
        // Emulate `git rev-parse --path-format=absolute --git-common-dir` for a
        // linked worktree — git returns the canonical .git directory.
        if (
          args.includes('--git-common-dir') &&
          args.includes('--path-format=absolute')
        ) {
          // Pretend our worktree resolves to the canonical repo .git.
          expect(cwd).toBe(worktree)
          return `${repo}/.git`
        }
        throw new Error(`unexpected git call: ${args.join(' ')}`)
      }

      const got = await resolveProjectRoot(worktree, { runGit })
      expect(resolvePath(got)).toBe(resolvePath(repo))
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('strips a trailing "/.git" suffix from the git output', async () => {
    const tmp = createTestTmpDir('anvil-root-strip')
    try {
      const repo = join(tmp, 'repo')
      const cwd = join(tmp, 'detached')
      await mkdir(cwd, { recursive: true })
      await writeFile(join(cwd, '.git'), 'gitdir: /fake\n')
      await mkdir(join(repo, '.anvil'), { recursive: true })
      await mkdir(join(repo, '.git'), { recursive: true })

      const got = await resolveProjectRoot(cwd, {
        runGit: () => `${repo}/.git`,
      })
      expect(resolvePath(got)).toBe(resolvePath(repo))
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('throws ProjectRootNotFoundError when .anvil/ is nowhere to be found', async () => {
    const tmp = createTestTmpDir('anvil-root-miss')
    try {
      // A directory inside a "repo" that contains neither .anvil/ nor any
      // ancestor .anvil/, and git refuses to answer.
      const repo = join(tmp, 'lonely-repo')
      const cwd = join(repo, 'src')
      await mkdir(cwd, { recursive: true })
      await mkdir(join(repo, '.git'), { recursive: true })
      await expect(
        resolveProjectRoot(cwd, {
          runGit: () => {
            throw new Error('not a git repo')
          },
        }),
      ).rejects.toBeInstanceOf(ProjectRootNotFoundError)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('throws ProjectRootNotFoundError when git resolves but the canonical root has no .anvil/', async () => {
    const tmp = createTestTmpDir('anvil-root-bare')
    try {
      const repo = join(tmp, 'repo-no-anvil')
      const worktree = join(tmp, 'wt')
      await mkdir(worktree, { recursive: true })
      await writeFile(join(worktree, '.git'), 'gitdir: /fake\n')
      await mkdir(repo, { recursive: true })
      await mkdir(join(repo, '.git'), { recursive: true })

      await expect(
        resolveProjectRoot(worktree, {
          runGit: () => `${repo}/.git`,
        }),
      ).rejects.toBeInstanceOf(ProjectRootNotFoundError)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('core/project/root — real linked-worktree fixture', () => {
  let tmp: string
  let repo: string
  let worktree: string

  beforeAll(async () => {
    tmp = createTestTmpDir('anvil-root-real')
    repo = join(tmp, 'repo')
    worktree = join(tmp, 'wt-feat')
    await mkdir(repo, { recursive: true })
    // Init repo with an initial commit so `git worktree add -b` works.
    execSync('git init -q -b main', { cwd: repo })
    execSync('git config user.email test@example.com', { cwd: repo })
    execSync('git config user.name test', { cwd: repo })
    await writeFile(join(repo, 'README.md'), '# fixture\n')
    execSync('git add README.md', { cwd: repo })
    execSync('git commit -q -m "init"', { cwd: repo })
    // Drop a .anvil/ marker at the canonical root.
    await mkdir(join(repo, '.anvil'), { recursive: true })
    await writeFile(join(repo, '.anvil', 'marker'), 'canonical\n')
    // Add a linked worktree on a fresh branch.
    execSync(`git worktree add -q -b feat-x "${worktree}"`, { cwd: repo })
  })

  afterAll(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true })
  })

  it('resolves to the canonical repo root from inside a real linked worktree', async () => {
    const got = await resolveProjectRoot(worktree)
    expect(resolvePath(got)).toBe(resolvePath(repo))
  })

  it('resolves to the canonical repo root from a nested path inside the worktree', async () => {
    const nested = join(worktree, 'src', 'a', 'b')
    await mkdir(nested, { recursive: true })
    const got = await resolveProjectRoot(nested)
    expect(resolvePath(got)).toBe(resolvePath(repo))
  })
})
