import { describe, expect, it } from 'vitest'
import {
  type DirtyFiles,
  getDirtyFiles,
} from '../../../../scripts/agent/dirty-files.js'

function makeRunGit(porcelain: string): (...args: string[]) => string {
  return (...args: string[]) => {
    if (args[0] === 'status') return porcelain
    throw new Error(`unexpected git ${args.join(' ')}`)
  }
}

describe('getDirtyFiles', () => {
  it('returns empty lists on clean repo', () => {
    const result = getDirtyFiles(makeRunGit(''))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const r = result as DirtyFiles
    expect(r.modified).toEqual([])
    expect(r.staged).toEqual([])
    expect(r.untracked).toEqual([])
  })

  it('returns untracked files', () => {
    const result = getDirtyFiles(makeRunGit('?? newfile.ts'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const r = result as DirtyFiles
    expect(r.untracked).toEqual(['newfile.ts'])
    expect(r.modified).toEqual([])
    expect(r.staged).toEqual([])
  })

  it('returns modified (worktree) files', () => {
    const result = getDirtyFiles(makeRunGit(' M src/foo.ts'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const r = result as DirtyFiles
    expect(r.modified).toEqual(['src/foo.ts'])
    expect(r.staged).toEqual([])
    expect(r.untracked).toEqual([])
  })

  it('returns staged files', () => {
    const result = getDirtyFiles(makeRunGit('M  src/bar.ts'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const r = result as DirtyFiles
    expect(r.staged).toEqual(['src/bar.ts'])
    expect(r.modified).toEqual([])
    expect(r.untracked).toEqual([])
  })

  it('handles file staged AND modified in worktree', () => {
    const result = getDirtyFiles(makeRunGit('MM src/both.ts'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const r = result as DirtyFiles
    expect(r.staged).toContain('src/both.ts')
    expect(r.modified).toContain('src/both.ts')
  })

  it('returns ok: false when git status fails', () => {
    const bad = (): never => {
      throw new Error('not a git repo')
    }
    const result = getDirtyFiles(bad)
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain(
      'not a git repo',
    )
  })

  it('handles multiple mixed entries', () => {
    const porcelain = [
      ' M src/a.ts',
      'M  src/b.ts',
      '?? src/c.ts',
      'MM src/d.ts',
    ].join('\n')
    const result = getDirtyFiles(makeRunGit(porcelain))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const r = result as DirtyFiles
    expect(r.modified).toContain('src/a.ts')
    expect(r.staged).toContain('src/b.ts')
    expect(r.untracked).toContain('src/c.ts')
    expect(r.staged).toContain('src/d.ts')
    expect(r.modified).toContain('src/d.ts')
  })
})
