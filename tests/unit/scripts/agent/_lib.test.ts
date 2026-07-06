import { describe, expect, it } from 'vitest'
import {
  type Failure,
  type PorcelainEntry,
  parseGitPorcelain,
} from '../../../../scripts/agent/_lib.js'

describe('parseGitPorcelain', () => {
  it('returns empty array for empty output', () => {
    expect(parseGitPorcelain('')).toEqual([])
    expect(parseGitPorcelain('   ')).toEqual([])
  })

  it('parses modified file', () => {
    const result = parseGitPorcelain(' M src/foo.ts\n')
    expect(result).toEqual<PorcelainEntry[]>([{ xy: ' M', path: 'src/foo.ts' }])
  })

  it('parses staged file', () => {
    const result = parseGitPorcelain('M  src/foo.ts\n')
    expect(result).toEqual<PorcelainEntry[]>([{ xy: 'M ', path: 'src/foo.ts' }])
  })

  it('parses untracked file', () => {
    const result = parseGitPorcelain('?? newfile.ts\n')
    expect(result).toEqual<PorcelainEntry[]>([{ xy: '??', path: 'newfile.ts' }])
  })

  it('parses rename entry', () => {
    const result = parseGitPorcelain('R  old.ts -> new.ts\n')
    expect(result).toEqual<PorcelainEntry[]>([
      { xy: 'R ', path: 'new.ts', origPath: 'old.ts' },
    ])
  })

  it('parses multiple entries', () => {
    const input = ' M src/a.ts\nM  src/b.ts\n?? src/c.ts'
    const result = parseGitPorcelain(input)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ xy: ' M', path: 'src/a.ts' })
    expect(result[1]).toEqual({ xy: 'M ', path: 'src/b.ts' })
    expect(result[2]).toEqual({ xy: '??', path: 'src/c.ts' })
  })
})

describe('Failure type shape', () => {
  it('Failure is { ok: false, error: string }', () => {
    const f: Failure = { ok: false, error: 'something went wrong' }
    expect(f.ok).toBe(false)
    expect(typeof f.error).toBe('string')
  })
})
