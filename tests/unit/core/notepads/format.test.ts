import { describe, expect, it } from 'vitest'
import {
  compressOlderThan,
  formatRecentContext,
} from '../../../../src/core/notepads/format.js'
import type { NotepadsEntry } from '../../../../src/core/notepads/types.js'

function makeEntry(
  section: NotepadsEntry['section'],
  headline: string,
  daysAgo: number,
  source = 'test-skill',
): NotepadsEntry {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return { section, headline, source, timestamp: ts }
}

describe('formatRecentContext', () => {
  it('returns empty string for empty entries', () => {
    expect(formatRecentContext([], 2000)).toBe('')
  })

  it('produces a header line with branch slug', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('learnings', 'test learning', 0),
    ]
    const result = formatRecentContext(entries, 4000, 'my-branch')
    expect(result).toContain('branch:my-branch')
  })

  it('groups entries by section', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('learnings', 'learning A', 0),
      makeEntry('decisions', 'decision B', 0),
      makeEntry('issues', 'issue C', 0),
    ]
    const result = formatRecentContext(entries, 4000, 'test')
    expect(result).toContain('Learnings (recent)')
    expect(result).toContain('Decisions (recent)')
    expect(result).toContain('Issues (active)')
  })

  it('includes the footer read-full-sections note', () => {
    const entries: NotepadsEntry[] = [makeEntry('learnings', 'test', 0)]
    const result = formatRecentContext(entries, 4000, 'test')
    expect(result).toContain('anvil notepad read')
  })

  it('truncates output to maxChars boundary', () => {
    const entries: NotepadsEntry[] = Array.from({ length: 50 }, (_, i) =>
      makeEntry('learnings', `learning headline number ${i}`, i),
    )
    const maxChars = 500
    const result = formatRecentContext(entries, maxChars, 'test')
    expect(result.length).toBeLessThanOrEqual(maxChars + 50) // slight tolerance for footer
  })

  it('sorts entries newest first within each section', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('learnings', 'old learning', 5),
      makeEntry('learnings', 'new learning', 0),
    ]
    const result = formatRecentContext(entries, 4000, 'test')
    const newIdx = result.indexOf('new learning')
    const oldIdx = result.indexOf('old learning')
    expect(newIdx).toBeLessThan(oldIdx)
  })

  it('omits sections with no entries', () => {
    const entries: NotepadsEntry[] = [makeEntry('decisions', 'a decision', 0)]
    const result = formatRecentContext(entries, 4000, 'test')
    expect(result).not.toContain('Learnings (recent)')
    expect(result).toContain('Decisions (recent)')
  })
})

describe('compressOlderThan', () => {
  it('keeps recent entries unchanged', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('learnings', 'new entry', 1),
      makeEntry('learnings', 'also new', 3),
    ]
    const result = compressOlderThan(entries, 7)
    expect(result).toHaveLength(2)
  })

  it('collapses old entries into a compressed stub', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('learnings', 'old entry 1', 10),
      makeEntry('learnings', 'old entry 2', 14),
    ]
    const result = compressOlderThan(entries, 7)
    expect(result).toHaveLength(1)
    expect(result[0].headline).toContain('Compressed')
    expect(result[0].headline).toContain('2 entries')
    expect(result[0].source).toBe('compact')
  })

  it('mixes recent and old correctly', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('decisions', 'recent one', 2),
      makeEntry('decisions', 'old one', 10),
    ]
    const result = compressOlderThan(entries, 7)
    expect(result).toHaveLength(2)
    const recentEntry = result.find((e) => e.headline === 'recent one')
    const compressedEntry = result.find((e) =>
      e.headline.startsWith('Compressed'),
    )
    expect(recentEntry).toBeTruthy()
    expect(compressedEntry).toBeTruthy()
  })

  it('returns empty array when all entries are recent', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('issues', 'issue 1', 1),
      makeEntry('issues', 'issue 2', 2),
    ]
    const result = compressOlderThan(entries, 7)
    expect(result).toHaveLength(2)
    expect(result.every((e) => e.source !== 'compact')).toBe(true)
  })

  it('includes date range in compressed stub', () => {
    const entries: NotepadsEntry[] = [
      makeEntry('learnings', 'entry 1', 10),
      makeEntry('learnings', 'entry 2', 15),
    ]
    const result = compressOlderThan(entries, 7)
    expect(result[0].headline).toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})
