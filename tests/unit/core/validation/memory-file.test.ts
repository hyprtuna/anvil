/**
 * Unit tests for src/core/validation/memory-file.ts (ANV-0125).
 */
import { describe, expect, it } from 'vitest'
import {
  CLAUDE_MD_STUB_PATTERN,
  detectInvariantViolations,
  extractH1,
  extractTableHeadings,
  formatViolations,
  isCanonicalStub,
  isClaudeMd,
  isMemoryFile,
} from '../../../../src/core/validation/memory-file.js'

describe('memory-file: file-type detection', () => {
  it('isMemoryFile recognises CLAUDE.md', () => {
    expect(isMemoryFile('foo/bar/CLAUDE.md')).toBe(true)
    expect(isMemoryFile('CLAUDE.md')).toBe(true)
  })
  it('isMemoryFile recognises AGENTS.md', () => {
    expect(isMemoryFile('foo/bar/AGENTS.md')).toBe(true)
  })
  it('isMemoryFile rejects other markdown', () => {
    expect(isMemoryFile('foo/README.md')).toBe(false)
    expect(isMemoryFile('docs/spec.md')).toBe(false)
  })
  it('isClaudeMd discriminates between CLAUDE.md and AGENTS.md', () => {
    expect(isClaudeMd('a/b/CLAUDE.md')).toBe(true)
    expect(isClaudeMd('a/b/AGENTS.md')).toBe(false)
  })
})

describe('memory-file: stub pattern', () => {
  it('matches canonical stub with HTML comment', () => {
    const stub =
      '<!-- Single source of truth lives in AGENTS.md. -->\n@./AGENTS.md'
    expect(isCanonicalStub(stub)).toBe(true)
  })
  it('matches canonical stub without HTML comment', () => {
    expect(isCanonicalStub('@./AGENTS.md')).toBe(true)
  })
  it('tolerates trailing whitespace', () => {
    expect(isCanonicalStub('@./AGENTS.md   \n')).toBe(true)
  })
  it('rejects extra content after the import', () => {
    expect(isCanonicalStub('@./AGENTS.md\n\nExtra prose')).toBe(false)
  })
  it('rejects body without import line', () => {
    expect(isCanonicalStub('# Hello\n')).toBe(false)
  })
  it('CLAUDE_MD_STUB_PATTERN is exported', () => {
    expect(CLAUDE_MD_STUB_PATTERN).toBeInstanceOf(RegExp)
  })
})

describe('memory-file: H1 extraction', () => {
  it('returns the first H1', () => {
    expect(extractH1('# Title\n## Sub')).toBe('Title')
  })
  it('returns null when no H1 present', () => {
    expect(extractH1('No heading here\n## Sub')).toBeNull()
  })
  it('ignores deeper headings', () => {
    expect(extractH1('## Sub\n### Subsub')).toBeNull()
  })
})

describe('memory-file: table heading extraction', () => {
  it('finds simple table heading', () => {
    const md = 'text\n| A | B |\n|---|---|\n| 1 | 2 |\n'
    expect(extractTableHeadings(md)).toEqual(['| A | B |'])
  })
  it('finds multiple headings', () => {
    const md =
      '| A | B |\n|---|---|\n| 1 | 2 |\n\nstuff\n\n| X | Y |\n|---|---|\n| 9 | 0 |'
    expect(extractTableHeadings(md)).toEqual(['| A | B |', '| X | Y |'])
  })
  it('ignores `|` lines without a separator follow-up', () => {
    const md = '| not | a | table |\nprose follows\n'
    expect(extractTableHeadings(md)).toEqual([])
  })
})

describe('memory-file: invariants — CLAUDE.md stub parity', () => {
  it('denies CLAUDE.md edit that breaks the stub', () => {
    const violations = detectInvariantViolations({
      path: 'src/hooks/CLAUDE.md',
      oldContent: '@./AGENTS.md\n',
      newContent: '# Pasted full content\n\nDescription...',
      siblingAgentsMdExists: true,
    })
    expect(violations.map((v) => v.kind)).toContain('stub-broken')
  })
  it('allows CLAUDE.md edit that preserves the stub', () => {
    const violations = detectInvariantViolations({
      path: 'src/hooks/CLAUDE.md',
      oldContent: '@./AGENTS.md\n',
      newContent: '<!-- new comment -->\n@./AGENTS.md\n',
      siblingAgentsMdExists: true,
    })
    expect(violations).toEqual([])
  })
  it('skips stub-parity check when no sibling AGENTS.md', () => {
    const violations = detectInvariantViolations({
      path: 'some/CLAUDE.md',
      oldContent: '# Heading\n',
      newContent: '# Heading\n\nMore prose.',
      siblingAgentsMdExists: false,
    })
    // With no sibling AGENTS.md, CLAUDE.md is treated as a normal memory file:
    // H1 preserved, no tables, no violation expected.
    expect(violations).toEqual([])
  })
})

describe('memory-file: invariants — H1', () => {
  it('denies AGENTS.md edit that drops the H1', () => {
    const violations = detectInvariantViolations({
      path: 'src/AGENTS.md',
      oldContent: '# src/ — AI Developer Notes\n\nLayered stuff.',
      newContent: 'Layered stuff.',
    })
    expect(violations.map((v) => v.kind)).toContain('missing-h1')
  })
  it('flags H1 rename', () => {
    const violations = detectInvariantViolations({
      path: 'src/AGENTS.md',
      oldContent: '# Title A\n',
      newContent: '# Title B\n',
    })
    expect(violations.map((v) => v.kind)).toContain('h1-changed')
  })
  it('allows edit that keeps the H1', () => {
    const violations = detectInvariantViolations({
      path: 'src/AGENTS.md',
      oldContent: '# Title\n\nOld body.',
      newContent: '# Title\n\nNew expanded body.',
    })
    expect(violations).toEqual([])
  })
})

describe('memory-file: invariants — table headings', () => {
  it('denies edit that drops a table heading', () => {
    const old = '# Title\n\n| Folder | Role |\n|---|---|\n| src | code |\n'
    const next = '# Title\n\nNarrative replaces the table.'
    const violations = detectInvariantViolations({
      path: 'src/AGENTS.md',
      oldContent: old,
      newContent: next,
    })
    expect(violations.map((v) => v.kind)).toContain('table-heading-dropped')
  })

  it('allows edit that adds a row to an existing table', () => {
    const old = '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n'
    const next = '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n'
    const violations = detectInvariantViolations({
      path: 'src/AGENTS.md',
      oldContent: old,
      newContent: next,
    })
    expect(violations).toEqual([])
  })

  it('allows edit that adds a NEW section', () => {
    const old = '# Title\n\n## Section A\n\nBody A.\n'
    const next =
      '# Title\n\n## Section A\n\nBody A.\n\n## Section B\n\nBody B.\n'
    const violations = detectInvariantViolations({
      path: 'docs/AGENTS.md',
      oldContent: old,
      newContent: next,
    })
    expect(violations).toEqual([])
  })

  it('allows edit that adds a NEW table', () => {
    const old = '# Title\n\nBody.\n'
    const next = '# Title\n\nBody.\n\n| New | Table |\n|---|---|\n| x | y |\n'
    const violations = detectInvariantViolations({
      path: 'docs/AGENTS.md',
      oldContent: old,
      newContent: next,
    })
    expect(violations).toEqual([])
  })
})

describe('memory-file: violation formatting', () => {
  it('returns empty string for no violations', () => {
    expect(formatViolations('foo/AGENTS.md', [])).toBe('')
  })
  it('renders a deny message with all violation details', () => {
    const msg = formatViolations('foo/AGENTS.md', [
      {
        kind: 'missing-h1',
        message: 'H1 dropped',
        detail: 'put it back',
      },
    ])
    expect(msg).toContain('BLOCKED')
    expect(msg).toContain('foo/AGENTS.md')
    expect(msg).toContain('missing-h1')
    expect(msg).toContain('H1 dropped')
    expect(msg).toContain('put it back')
    expect(msg).toContain('ANVIL_ALLOW_RESTRUCTURE=1')
  })
})
