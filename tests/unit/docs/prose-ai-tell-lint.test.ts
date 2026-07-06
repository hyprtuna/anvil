/**
 * ANV-0279 — Unit tests for the prose AI-tell denylist lint rule.
 *
 * Tests are deterministic and require no network I/O.
 * Each behaviour is exercised via in-memory fixture lines or a temporary
 * fixture directory built in os.tmpdir().
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AI_TELL_SKIP_MARKER,
  PROSE_AI_TELL_DENYLIST,
  checkProseAiTell,
  collectProseFiles,
  runProseAiTellLint,
} from '../../../src/core/docs/lint/index.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpRoot: string

beforeEach(() => {
  tmpRoot = join(tmpdir(), `anvil-ai-tell-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function write(relPath: string, content: string): string {
  const abs = join(tmpRoot, relPath)
  mkdirSync(join(tmpRoot, relPath.split('/').slice(0, -1).join('/')), {
    recursive: true,
  })
  writeFileSync(abs, content, 'utf-8')
  return abs
}

// ---------------------------------------------------------------------------
// PROSE_AI_TELL_DENYLIST — basic shape contract
// ---------------------------------------------------------------------------

describe('PROSE_AI_TELL_DENYLIST', () => {
  it('is non-empty', () => {
    expect(PROSE_AI_TELL_DENYLIST.length).toBeGreaterThan(0)
  })

  it('contains key seed terms', () => {
    const lower = PROSE_AI_TELL_DENYLIST.map((t) => t.toLowerCase())
    expect(lower).toContain('seamless')
    expect(lower).toContain('delve')
    expect(lower).toContain('tapestry')
    expect(lower.some((t) => t.includes("it's worth noting"))).toBe(true)
    expect(lower.some((t) => t.includes('in the realm of'))).toBe(true)
  })

  it('has no duplicate entries (case-insensitive)', () => {
    const lower = PROSE_AI_TELL_DENYLIST.map((t) => t.toLowerCase())
    const deduped = new Set(lower)
    expect(deduped.size).toBe(lower.length)
  })
})

// ---------------------------------------------------------------------------
// checkProseAiTell — term detection
// ---------------------------------------------------------------------------

describe('checkProseAiTell — term present → warn', () => {
  it('flags "seamless" in prose', () => {
    const filePath = write(
      'docs/guide.md',
      'This provides a seamless experience.\n',
    )
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(
      filePath,
      tmpRoot,
      ['This provides a seamless experience.'],
      v,
    )
    expect(v).toHaveLength(1)
    expect(v[0].rule).toBe('prose-ai-tell')
    expect(v[0].detail).toContain('seamless')
    expect(v[0].line).toBe(1)
  })

  it('flags "delve" in prose', () => {
    const filePath = write(
      'docs/intro.md',
      'We will delve into the architecture.\n',
    )
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(
      filePath,
      tmpRoot,
      ['We will delve into the architecture.'],
      v,
    )
    expect(v).toHaveLength(1)
    expect(v[0].detail).toContain('delve')
  })

  it('flags "tapestry" in prose', () => {
    const filePath = write('docs/intro.md', 'A rich tapestry of features.\n')
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, ['A rich tapestry of features.'], v)
    expect(v).toHaveLength(1)
    expect(v[0].detail).toContain('tapestry')
  })

  it('flags "it\'s worth noting" phrase', () => {
    const filePath = write(
      'docs/notes.md',
      "It's worth noting that this is important.\n",
    )
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(
      filePath,
      tmpRoot,
      ["It's worth noting that this is important."],
      v,
    )
    expect(v).toHaveLength(1)
    expect(v[0].detail.toLowerCase()).toContain("it's worth noting")
  })

  it('flags "in the realm of" phrase', () => {
    const filePath = write(
      'docs/notes.md',
      'In the realm of testing, this matters.\n',
    )
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(
      filePath,
      tmpRoot,
      ['In the realm of testing, this matters.'],
      v,
    )
    expect(v).toHaveLength(1)
  })

  it('is case-insensitive (SEAMLESS)', () => {
    const filePath = write('docs/guide.md', 'Provides a SEAMLESS workflow.\n')
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, ['Provides a SEAMLESS workflow.'], v)
    expect(v).toHaveLength(1)
  })

  it('produces only one violation per line even when multiple terms appear', () => {
    const filePath = write(
      'docs/guide.md',
      'A seamless and delve experience.\n',
    )
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, ['A seamless and delve experience.'], v)
    expect(v).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// checkProseAiTell — whole-word matching for single-word terms (ANV-0279 fix)
// ---------------------------------------------------------------------------

describe('checkProseAiTell — single-word terms match whole words only', () => {
  it('does NOT flag "delve" inside a larger word ("delved" is its own term, but "delvex" must not fire)', () => {
    const line = 'The delvex parser handles this.'
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(0)
  })

  it('does NOT flag "synergy" inside "antisynergy"', () => {
    const line = 'This is an antisynergy situation.'
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(0)
  })

  it('still flags "delve" as a standalone whole word', () => {
    const line = 'We delve into the parser.'
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(1)
    expect(v[0].detail).toContain('delve')
  })

  it('flags a single-word term at the start of a line (boundary = line start)', () => {
    const line = 'Seamless onboarding is the goal.'
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(1)
  })

  it('flags a single-word term followed by punctuation', () => {
    const line = 'It was groundbreaking, truly.'
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(1)
  })

  it('matches the hyphenated single-word term "cutting-edge" as a unit', () => {
    const line = 'A cutting-edge approach to parsing.'
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(1)
    expect(v[0].detail).toContain('cutting-edge')
  })

  it('still substring-matches multi-word phrases despite surrounding punctuation', () => {
    const line = "(It's worth noting, this is fine.)"
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(1)
    expect(v[0].detail.toLowerCase()).toContain("it's worth noting")
  })
})

// ---------------------------------------------------------------------------
// checkProseAiTell — skip marker suppression
// ---------------------------------------------------------------------------

describe('checkProseAiTell — skip marker → no warn', () => {
  it('suppresses with <!-- ai-tell: skip --> on the same line', () => {
    const line = `This provides a seamless experience. ${AI_TELL_SKIP_MARKER}`
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(0)
  })

  it('suppresses with <!-- doc-drift: skip --> on the same line', () => {
    const line = 'This provides a seamless experience. <!-- doc-drift: skip -->'
    const filePath = write('docs/guide.md', `${line}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, [line], v)
    expect(v).toHaveLength(0)
  })

  it('does NOT suppress an adjacent line (skip is per-line)', () => {
    const lines = [
      `seamless experience. ${AI_TELL_SKIP_MARKER}`,
      'Another delve into the code.',
    ]
    const filePath = write('docs/guide.md', `${lines.join('\n')}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, lines, v)
    // First line is skipped; second should flag.
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// checkProseAiTell — frontmatter exclusion
// ---------------------------------------------------------------------------

describe('checkProseAiTell — frontmatter excluded', () => {
  it('does not flag terms inside the YAML frontmatter block', () => {
    const lines = [
      '---',
      'title: seamless',
      'description: delve into this',
      '---',
      '# Normal body',
    ]
    const filePath = write('docs/skill.md', `${lines.join('\n')}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, lines, v)
    expect(v).toHaveLength(0)
  })

  it('flags terms appearing after the frontmatter closes', () => {
    const lines = ['---', 'title: safe', '---', 'A seamless experience.']
    const filePath = write('docs/skill.md', `${lines.join('\n')}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, lines, v)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// checkProseAiTell — code fence exclusion
// ---------------------------------------------------------------------------

describe('checkProseAiTell — code fences excluded', () => {
  it('does not flag terms inside backtick code fences', () => {
    const lines = [
      '# Guide',
      '```bash',
      '# seamless deployment',
      'echo "delve into this"',
      '```',
      'Normal prose here.',
    ]
    const filePath = write('docs/guide.md', `${lines.join('\n')}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, lines, v)
    expect(v).toHaveLength(0)
  })

  it('does not flag terms inside tilde code fences', () => {
    const lines = ['~~~', 'seamless config', '~~~', 'Clean prose.']
    const filePath = write('docs/guide.md', `${lines.join('\n')}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, lines, v)
    expect(v).toHaveLength(0)
  })

  it('resumes scanning after fence closes', () => {
    const lines = ['```', 'seamless', '```', 'A delve into options.']
    const filePath = write('docs/guide.md', `${lines.join('\n')}\n`)
    const v: Parameters<typeof checkProseAiTell>[3] = []
    checkProseAiTell(filePath, tmpRoot, lines, v)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// collectProseFiles — scope
// ---------------------------------------------------------------------------

describe('collectProseFiles', () => {
  it('collects .md files from skills/, agents/, and docs/ recursively', () => {
    write('skills/universal/code-review.md', '# code-review')
    write('agents/planner.md', '# planner')
    write('docs/guide.md', '# guide')
    write('docs/anvil/internal.md', '# internal')
    write('src/core/types.ts', 'export type Foo = string')

    const files = collectProseFiles(tmpRoot)
    const rel = files.map((f) => f.replace(`${tmpRoot}/`, ''))

    expect(rel).toContain('skills/universal/code-review.md')
    expect(rel).toContain('agents/planner.md')
    expect(rel).toContain('docs/guide.md')
    expect(rel).toContain('docs/anvil/internal.md')
    // Does NOT include .ts files
    expect(rel.some((f) => f.endsWith('.ts'))).toBe(false)
  })

  it('returns empty array when none of the target dirs exist', () => {
    expect(collectProseFiles(tmpRoot)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// runProseAiTellLint — integration
// ---------------------------------------------------------------------------

describe('runProseAiTellLint', () => {
  it('returns zero violations for clean files', () => {
    write('docs/guide.md', '# Clean Guide\n\nThis is straightforward.\n')
    write(
      'skills/code-review.md',
      '---\nname: code-review\n---\n\nReview the diff.\n',
    )
    const result = runProseAiTellLint(tmpRoot)
    expect(result.violations).toHaveLength(0)
    expect(result.filesScanned).toBeGreaterThanOrEqual(2)
  })

  it('detects a term in docs/', () => {
    write('docs/intro.md', 'Provides a seamless experience.\n')
    const result = runProseAiTellLint(tmpRoot)
    expect(result.violations.length).toBeGreaterThanOrEqual(1)
    expect(result.violations[0].rule).toBe('prose-ai-tell')
  })

  it('detects a term in skills/', () => {
    write(
      'skills/my-skill.md',
      '---\nname: my-skill\n---\n\nWe delve into the code.\n',
    )
    const result = runProseAiTellLint(tmpRoot)
    const hits = result.violations.filter((v) => v.file.includes('skills/'))
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('skips a file containing the ai-tell skip marker on the first line', () => {
    write(
      'docs/deliberate.md',
      `${AI_TELL_SKIP_MARKER}\nseamless tapestry delve\n`,
    )
    const result = runProseAiTellLint(tmpRoot)
    const hits = result.violations.filter((v) => v.file.includes('deliberate'))
    expect(hits).toHaveLength(0)
  })

  it('severity is always prose-ai-tell (warn-rule) — never produces broken-link etc.', () => {
    write('docs/slop.md', 'A tapestry of features, seamlessly integrated.\n')
    const result = runProseAiTellLint(tmpRoot)
    for (const v of result.violations) {
      expect(v.rule).toBe('prose-ai-tell')
    }
  })
})
