import { mkdirSync, writeFileSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  findTicketFile,
  readSpecExcerpt,
} from '../../../../src/core/worktree/discover.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('core/worktree/discover — findTicketFile', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('discover')
    mkdirSync(join(tmp, '.anvil', 'tickets'), { recursive: true })
  })

  it('returns null when tickets dir is absent', () => {
    const noTickets = createTestTmpDir('no-tickets')
    try {
      expect(findTicketFile('ANV-0157', noTickets)).toBeNull()
    } finally {
      rmSync(noTickets, { recursive: true, force: true })
    }
  })

  it('finds a matching ticket file and extracts H1 header', () => {
    const content = '# ANV-0157 — Fix install-scope detection\n\nSome content.'
    writeFileSync(
      join(tmp, '.anvil', 'tickets', 'ANV-0157-fix-install-scope.md'),
      content,
    )
    const result = findTicketFile('ANV-0157', tmp)
    expect(result).not.toBeNull()
    expect(result?.header).toBe('ANV-0157 — Fix install-scope detection')
    expect(result?.path).toContain('ANV-0157-fix-install-scope.md')
  })

  it('returns null when no matching ticket file exists', () => {
    writeFileSync(
      join(tmp, '.anvil', 'tickets', 'ANV-9999-other.md'),
      '# ANV-9999 — Other',
    )
    expect(findTicketFile('ANV-0157', tmp)).toBeNull()
  })

  it('is case-insensitive for ticket id', () => {
    const content = '# ANV-0200 — Case test\n'
    writeFileSync(
      join(tmp, '.anvil', 'tickets', 'ANV-0200-case-test.md'),
      content,
    )
    // Search with lowercase
    const result = findTicketFile('anv-0200', tmp)
    expect(result).not.toBeNull()
    expect(result?.header).toBe('ANV-0200 — Case test')
  })

  it('falls back to filename when no H1 is present', () => {
    writeFileSync(
      join(tmp, '.anvil', 'tickets', 'ANV-0201-no-header.md'),
      'Just content without a header\n',
    )
    const result = findTicketFile('ANV-0201', tmp)
    expect(result).not.toBeNull()
    expect(result?.header).toBe('ANV-0201-no-header')
  })
})

describe('core/worktree/discover — readSpecExcerpt', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('excerpt')
  })

  it('returns full content when under maxChars', () => {
    const content = 'Short content'
    const path = join(tmp, 'short.md')
    writeFileSync(path, content)
    expect(readSpecExcerpt(path, 300)).toBe(content)
  })

  it('truncates at maxChars and appends ellipsis', () => {
    const content = 'a'.repeat(400)
    const path = join(tmp, 'long.md')
    writeFileSync(path, content)
    const result = readSpecExcerpt(path, 300)
    expect(result).toHaveLength(302) // 300 + '\n…' (2 chars)
    expect(result).toMatch(/…$/)
  })

  it('returns empty string for non-existent file', () => {
    expect(readSpecExcerpt(join(tmp, 'missing.md'), 300)).toBe('')
  })
})
