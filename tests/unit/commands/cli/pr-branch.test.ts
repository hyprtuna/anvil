import { describe, expect, it } from 'vitest'
import { classifyCommitFiles } from '../../../../scripts/dev/pr-branch.js'

describe('commands/cli/pr-branch — classifier', () => {
  it('returns "artifact" when every file is under a known artifact path', () => {
    const r = classifyCommitFiles([
      '.anvil/handoff.json',
      'docs/anvil/plans/2026-04-19-foo.md',
    ])
    expect(r).toBe('artifact')
  })

  it('returns "code" when at least one file is outside artifact paths', () => {
    const r = classifyCommitFiles([
      '.anvil/handoff.json',
      'src/commands/cli/note.ts',
    ])
    expect(r).toBe('code')
  })

  it('returns "code" when only code files are touched', () => {
    const r = classifyCommitFiles(['src/index.ts', 'tests/unit/foo.test.ts'])
    expect(r).toBe('code')
  })

  it('handles every artifact path: .anvil, docs/anvil/plans, docs/anvil/references, .planning', () => {
    expect(
      classifyCommitFiles([
        '.anvil/x',
        'docs/anvil/plans/y.md',
        'docs/anvil/references/z.md',
        '.planning/q',
      ]),
    ).toBe('artifact')
  })

  it('returns "empty" for an empty file list', () => {
    expect(classifyCommitFiles([])).toBe('empty')
  })
})
