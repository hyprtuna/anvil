import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendEntry,
  compact,
  initNotepad,
  listNotepads,
  loadRecentContext,
  readSection,
} from '../../../../src/core/notepads/index.js'
import type { NotepadsEntry } from '../../../../src/core/notepads/types.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = join(tmpdir(), `anvil-notepad-test-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

function makeEntry(
  section: NotepadsEntry['section'],
  headline: string,
  daysAgo = 0,
): NotepadsEntry {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return { section, headline, source: 'test-skill', timestamp: ts }
}

describe('loadRecentContext', () => {
  it('returns empty string when no notepad exists', async () => {
    const result = await loadRecentContext(tmpDir, 'main')
    expect(result).toBe('')
  })

  it('returns content when recent-context.md exists', async () => {
    const dir = join(tmpDir, '.anvil', 'notepads', 'main')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'recent-context.md'),
      '# test context\n- item 1',
      'utf-8',
    )

    const result = await loadRecentContext(tmpDir, 'main')
    expect(result).toContain('test context')
  })

  it('truncates content exceeding maxChars and appends truncation notice', async () => {
    const dir = join(tmpDir, '.anvil', 'notepads', 'main')
    await mkdir(dir, { recursive: true })
    const longContent = 'line\n'.repeat(200)
    await writeFile(join(dir, 'recent-context.md'), longContent, 'utf-8')

    const result = await loadRecentContext(tmpDir, 'main', 100)
    expect(result.length).toBeLessThanOrEqual(200) // truncated
    expect(result).toContain('truncated')
  })

  it('returns empty string for empty file', async () => {
    const dir = join(tmpDir, '.anvil', 'notepads', 'main')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'recent-context.md'), '', 'utf-8')

    const result = await loadRecentContext(tmpDir, 'main')
    expect(result).toBe('')
  })

  it('returns stub message for files >5KB', async () => {
    const dir = join(tmpDir, '.anvil', 'notepads', 'main')
    await mkdir(dir, { recursive: true })
    const bigContent = 'a'.repeat(6000)
    await writeFile(join(dir, 'recent-context.md'), bigContent, 'utf-8')

    const result = await loadRecentContext(tmpDir, 'main')
    expect(result).toContain('notepad too large')
  })
})

describe('appendEntry', () => {
  it('creates directory and section file if not exists', async () => {
    const entry = makeEntry('learnings', 'my test learning')
    await appendEntry(tmpDir, 'main', entry)

    const sectionPath = join(
      tmpDir,
      '.anvil',
      'notepads',
      'main',
      'learnings.md',
    )
    expect(existsSync(sectionPath)).toBe(true)
  })

  it('also creates recent-context.md', async () => {
    const entry = makeEntry('learnings', 'a learning')
    await appendEntry(tmpDir, 'main', entry)

    const contextPath = join(
      tmpDir,
      '.anvil',
      'notepads',
      'main',
      'recent-context.md',
    )
    expect(existsSync(contextPath)).toBe(true)
  })

  it('is idempotent — skips duplicate headline within last hour', async () => {
    const entry = makeEntry('learnings', 'duplicate entry')
    await appendEntry(tmpDir, 'main', entry)
    await appendEntry(tmpDir, 'main', entry) // same entry again

    const entries = await readSection(tmpDir, 'main', 'learnings')
    const matching = entries.filter((e) => e.headline === 'duplicate entry')
    expect(matching).toHaveLength(1)
  })

  it('allows appending different headlines', async () => {
    await appendEntry(tmpDir, 'main', makeEntry('decisions', 'decision A'))
    await appendEntry(tmpDir, 'main', makeEntry('decisions', 'decision B'))

    const entries = await readSection(tmpDir, 'main', 'decisions')
    expect(entries.length).toBeGreaterThanOrEqual(2)
  })

  it('handles branchy slugs (feature/auth → feature-auth)', async () => {
    const entry = makeEntry('issues', 'found a bug')
    await appendEntry(tmpDir, 'feature/auth', entry)

    const dir = join(tmpDir, '.anvil', 'notepads', 'feature-auth')
    expect(existsSync(dir)).toBe(true)
  })
})

describe('readSection', () => {
  it('returns empty array when section file does not exist', async () => {
    const result = await readSection(tmpDir, 'main', 'learnings')
    expect(result).toEqual([])
  })

  it('returns entries after appending', async () => {
    await appendEntry(tmpDir, 'main', makeEntry('learnings', 'entry 1'))
    await appendEntry(tmpDir, 'main', makeEntry('learnings', 'entry 2'))

    const entries = await readSection(tmpDir, 'main', 'learnings')
    const headlines = entries.map((e) => e.headline)
    expect(headlines).toContain('entry 1')
    expect(headlines).toContain('entry 2')
  })
})

describe('compact', () => {
  it('returns zero removed/kept when notepad is empty', async () => {
    const result = await compact(tmpDir, 'main')
    expect(result.removed).toBe(0)
    expect(result.kept).toBe(0)
  })

  it('compresses old entries', async () => {
    // Append an "old" entry by directly writing it
    const oldEntry: NotepadsEntry = {
      section: 'learnings',
      headline: 'old entry from 10 days ago',
      source: 'test',
      timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    }
    await appendEntry(tmpDir, 'main', oldEntry)

    const before = await readSection(tmpDir, 'main', 'learnings')
    expect(before.length).toBe(1)

    const result = await compact(tmpDir, 'main', { olderThanDays: 7 })
    expect(result.removed).toBe(1) // old entry removed
    expect(result.kept).toBe(1) // compressed stub kept
  })
})

describe('initNotepad', () => {
  it('creates all 6 section stub files (Plan 32 C6 added large-outputs)', async () => {
    const created = await initNotepad(tmpDir, 'main')
    expect(created).toHaveLength(6)
    const sections = [
      'learnings',
      'decisions',
      'issues',
      'verification',
      'problems',
      'large-outputs',
    ]
    for (const s of sections) {
      expect(
        existsSync(join(tmpDir, '.anvil', 'notepads', 'main', `${s}.md`)),
      ).toBe(true)
    }
  })

  it('is idempotent — does not overwrite existing files', async () => {
    await initNotepad(tmpDir, 'main')
    const learningsPath = join(
      tmpDir,
      '.anvil',
      'notepads',
      'main',
      'learnings.md',
    )
    await writeFile(learningsPath, '# custom content', 'utf-8')

    await initNotepad(tmpDir, 'main')

    const content = await import('node:fs/promises').then((m) =>
      m.readFile(learningsPath, 'utf-8'),
    )
    expect(content).toBe('# custom content')
  })
})

describe('listNotepads', () => {
  it('returns empty array when notepads dir does not exist', async () => {
    const result = await listNotepads(tmpDir)
    expect(result).toEqual([])
  })

  it('returns branch slugs from notepads directory', async () => {
    await initNotepad(tmpDir, 'main')
    await initNotepad(tmpDir, 'feature/auth')

    const slugs = await listNotepads(tmpDir)
    expect(slugs).toContain('main')
    expect(slugs).toContain('feature-auth')
  })
})
