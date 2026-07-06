import { describe, expect, it } from 'vitest'
import { parseSlateSections } from '../../../../../src/core/release/parse-slate-sections.js'

const SAMPLE_SLATE = `# v0.13.4 — Agent Ergonomics II

Status: planned

## Composition

| Category | This release |
|---|---|
| addition | 3 |

## Slate

### Added — 3 (agent ergonomics)

- [P1] **ANV-0154** — \`anvil release\` command.
- [P1] **ANV-0155** — \`anvil worktree\` commands.

### Improved — 2 (doctor UX)

- [P1] **ANV-0158** — Promote skip rows.
- [P1] **ANV-0159** — Rephrase migration-window suppression.

### Fixed — 2

- [P1] **ANV-0157** — Install scope detection.
- [P1] **ANV-0160** — Test-environment determinism.

### Deferred

- Nothing deferred yet.
`

describe('parseSlateSections', () => {
  it('extracts the Added section', () => {
    const sections = parseSlateSections(SAMPLE_SLATE)
    expect(sections.added).toBeDefined()
    expect(sections.added).toContain('ANV-0154')
    expect(sections.added).toContain('ANV-0155')
  })

  it('extracts the Improved section', () => {
    const sections = parseSlateSections(SAMPLE_SLATE)
    expect(sections.improved).toBeDefined()
    expect(sections.improved).toContain('ANV-0158')
    expect(sections.improved).toContain('ANV-0159')
  })

  it('extracts the Fixed section', () => {
    const sections = parseSlateSections(SAMPLE_SLATE)
    expect(sections.fixed).toBeDefined()
    expect(sections.fixed).toContain('ANV-0157')
    expect(sections.fixed).toContain('ANV-0160')
  })

  it('extracts the Deferred section', () => {
    const sections = parseSlateSections(SAMPLE_SLATE)
    expect(sections.deferred).toBeDefined()
    expect(sections.deferred).toContain('Nothing deferred yet')
  })

  it('returns undefined for missing sections', () => {
    const sections = parseSlateSections(SAMPLE_SLATE)
    expect(sections.changed).toBeUndefined()
  })

  it('does not bleed content from one section into another', () => {
    const sections = parseSlateSections(SAMPLE_SLATE)
    // The Added section should not include ANV-0158 (that is in Improved)
    expect(sections.added).not.toContain('ANV-0158')
    // The Improved section should not include ANV-0157 (that is in Fixed)
    expect(sections.improved).not.toContain('ANV-0157')
  })

  it('returns empty object for a slate with no recognized sections', () => {
    const sections = parseSlateSections(
      '# Some other doc\n\nNo sections here.\n',
    )
    expect(Object.keys(sections)).toHaveLength(0)
  })

  it('handles case-insensitive section headings', () => {
    const slate = '### ADDED\n\n- item 1\n\n### fixed\n\n- item 2\n'
    const sections = parseSlateSections(slate)
    expect(sections.added).toContain('item 1')
    expect(sections.fixed).toContain('item 2')
  })
})
