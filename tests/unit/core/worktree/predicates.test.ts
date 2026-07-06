import { describe, expect, it } from 'vitest'
import {
  classifyWorktreeEntry,
  hasUnpushedCommits,
  isAnvilWorktreePath,
  isDirtyTree,
  isMergedBranch,
  isProtectedPath,
} from '../../../../src/core/worktree/predicates.js'
import type { WorktreeEntry } from '../../../../src/core/worktree/types.js'

describe('core/worktree/predicates — isProtectedPath', () => {
  it('protects .claude/worktrees/* paths', () => {
    expect(isProtectedPath('/repo/.claude/worktrees/agent-abc')).toBe(true)
    expect(isProtectedPath('/repo/.claude/worktrees/session-1')).toBe(true)
  })

  it('protects any path containing .claude segment', () => {
    expect(isProtectedPath('/home/user/.claude/something')).toBe(true)
  })

  it('does NOT protect .worktrees/* paths', () => {
    expect(isProtectedPath('/repo/.worktrees/anv-0155-feature')).toBe(false)
    expect(isProtectedPath('/repo/.worktrees/my-branch')).toBe(false)
  })

  it('does NOT protect unrelated paths', () => {
    expect(isProtectedPath('/repo/src/index.ts')).toBe(false)
    expect(isProtectedPath('/tmp/some-dir')).toBe(false)
  })
})

describe('core/worktree/predicates — isAnvilWorktreePath', () => {
  it('returns true for .worktrees/* paths', () => {
    expect(isAnvilWorktreePath('/repo/.worktrees/anv-0155')).toBe(true)
    expect(isAnvilWorktreePath('/repo/.worktrees/feat-branch')).toBe(true)
  })

  it('returns false for non-.worktrees paths', () => {
    expect(isAnvilWorktreePath('/repo/src')).toBe(false)
    expect(isAnvilWorktreePath('/repo/.claude/worktrees/agent')).toBe(false)
    expect(isAnvilWorktreePath('/tmp/random')).toBe(false)
  })
})

describe('core/worktree/predicates — isMergedBranch', () => {
  const merged = ['main', '  feat/anv-0155  ', 'feat/anv-0100']

  it('returns true for merged branch', () => {
    expect(isMergedBranch('feat/anv-0155', merged)).toBe(true)
    expect(isMergedBranch('main', merged)).toBe(true)
  })

  it('returns false for unmerged branch', () => {
    expect(isMergedBranch('feat/anv-0999', merged)).toBe(false)
  })

  it('trims whitespace in comparison', () => {
    expect(isMergedBranch('feat/anv-0155', ['  feat/anv-0155  '])).toBe(true)
  })
})

describe('core/worktree/predicates — hasUnpushedCommits', () => {
  it('returns true when remote SHA is null (no remote tracking)', () => {
    expect(hasUnpushedCommits('abc123', null)).toBe(true)
    expect(hasUnpushedCommits('abc123', undefined)).toBe(true)
    expect(hasUnpushedCommits('abc123', '')).toBe(true)
  })

  it('returns true when local and remote differ', () => {
    expect(hasUnpushedCommits('abc123', 'def456')).toBe(true)
  })

  it('returns false when local and remote match', () => {
    expect(hasUnpushedCommits('abc123', 'abc123')).toBe(false)
    expect(hasUnpushedCommits('  abc123  ', 'abc123  ')).toBe(false)
  })
})

describe('core/worktree/predicates — isDirtyTree', () => {
  it('returns true for non-empty status output', () => {
    expect(isDirtyTree(' M src/index.ts\n')).toBe(true)
    expect(isDirtyTree('M  src/index.ts')).toBe(true)
  })

  it('returns false for empty status output', () => {
    expect(isDirtyTree('')).toBe(false)
    expect(isDirtyTree('  \n  ')).toBe(false)
  })
})

describe('core/worktree/predicates — classifyWorktreeEntry', () => {
  const baseEntry: WorktreeEntry = {
    path: '/repo/.worktrees/feat-branch',
    branch: 'feat/anv-0155',
    head: 'abc123',
    bare: false,
  }

  const baseOpts = {
    primaryPath: '/repo',
    isDirty: false,
    isMerged: true,
    hasUnpushed: false,
    force: false,
    all: false,
  }

  it('returns remove for merged, clean, pushed worktree', () => {
    const result = classifyWorktreeEntry(baseEntry, baseOpts)
    expect(result.action).toBe('remove')
  })

  it('skips primary worktree', () => {
    const entry = { ...baseEntry, path: '/repo' }
    const result = classifyWorktreeEntry(entry, baseOpts)
    expect(result.action).toBe('skip-primary')
  })

  it('skips protected .claude paths', () => {
    const entry = { ...baseEntry, path: '/repo/.claude/worktrees/agent-1' }
    const result = classifyWorktreeEntry(entry, baseOpts)
    expect(result.action).toBe('skip-protected')
  })

  it('skips paths not under .worktrees/', () => {
    const entry = { ...baseEntry, path: '/tmp/random-worktree' }
    const result = classifyWorktreeEntry(entry, baseOpts)
    expect(result.action).toBe('skip-protected')
  })

  it('skips dirty worktree', () => {
    const result = classifyWorktreeEntry(baseEntry, {
      ...baseOpts,
      isDirty: true,
    })
    expect(result.action).toBe('skip-dirty')
  })

  it('skips unpushed branch without --force', () => {
    const result = classifyWorktreeEntry(baseEntry, {
      ...baseOpts,
      hasUnpushed: true,
      force: false,
    })
    expect(result.action).toBe('skip-unpushed')
  })

  it('removes unpushed branch WITH --force', () => {
    const result = classifyWorktreeEntry(baseEntry, {
      ...baseOpts,
      hasUnpushed: true,
      force: true,
    })
    expect(result.action).toBe('remove')
  })

  it('skips unmerged branch without --all', () => {
    const result = classifyWorktreeEntry(baseEntry, {
      ...baseOpts,
      isMerged: false,
      all: false,
    })
    expect(result.action).toBe('skip-unmerged')
  })

  it('removes unmerged branch WITH --all', () => {
    const result = classifyWorktreeEntry(baseEntry, {
      ...baseOpts,
      isMerged: false,
      all: true,
    })
    expect(result.action).toBe('remove')
  })
})
