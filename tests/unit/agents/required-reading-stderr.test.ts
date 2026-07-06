/**
 * E-005 — runtime stderr for missing required_reading paths (D-09).
 *
 * Verifies that buildRequiredReadingBlock writes one stderr line per agent
 * invocation when agentName is provided and paths are missing/unreadable.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRequiredReadingBlock } from '../../../src/agents/required-reading.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

let tmp: string
let stderrWrites: string[]

beforeEach(() => {
  tmp = createTestTmpDir('rr-stderr')
  stderrWrites = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrWrites.push(String(chunk))
    return true
  })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('buildRequiredReadingBlock — E-005 stderr', () => {
  it('writes one stderr line when agentName provided and a path is missing', () => {
    writeFileSync(join(tmp, 'exists.md'), '# exists\n')
    buildRequiredReadingBlock(['exists.md', 'missing.md'], tmp, 'my-agent')
    const relevant = stderrWrites.filter((s) =>
      s.includes('required_reading path(s) missing/unreadable'),
    )
    expect(relevant).toHaveLength(1)
    expect(relevant[0]).toContain('my-agent')
    expect(relevant[0]).toContain('missing.md')
  })

  it('returned block contains content from readable file but not missing one', () => {
    writeFileSync(join(tmp, 'exists.md'), '# exists content\n')
    const block = buildRequiredReadingBlock(
      ['exists.md', 'missing.md'],
      tmp,
      'my-agent',
    )
    expect(block).not.toBeNull()
    expect(block).toContain('exists content')
    expect(block).not.toContain('missing.md')
  })

  it('does NOT write stderr when no agentName provided (silent for backward compat)', () => {
    buildRequiredReadingBlock(['missing.md'], tmp)
    const relevant = stderrWrites.filter((s) =>
      s.includes('required_reading path(s) missing/unreadable'),
    )
    expect(relevant).toHaveLength(0)
  })

  it('does NOT write stderr when all paths are present', () => {
    writeFileSync(join(tmp, 'exists.md'), '# content\n')
    buildRequiredReadingBlock(['exists.md'], tmp, 'my-agent')
    const relevant = stderrWrites.filter((s) =>
      s.includes('required_reading path(s) missing/unreadable'),
    )
    expect(relevant).toHaveLength(0)
  })

  it('lists all missing paths in the single stderr line', () => {
    buildRequiredReadingBlock(
      ['a.md', 'b.md', 'c.md'],
      tmp,
      'multi-missing-agent',
    )
    const relevant = stderrWrites.filter((s) =>
      s.includes('required_reading path(s) missing/unreadable'),
    )
    expect(relevant).toHaveLength(1)
    expect(relevant[0]).toContain('a.md')
    expect(relevant[0]).toContain('b.md')
    expect(relevant[0]).toContain('c.md')
  })
})
