import { describe, expect, it } from 'vitest'
import { buildClaudeMdContext } from '../../../../src/commands/cli/revise-claude-md.js'

describe('commands/cli/revise-claude-md', () => {
  it('builds context string with default scope', () => {
    const ctx = buildClaudeMdContext({})
    expect(ctx).toContain('Audit and improve CLAUDE.md')
    expect(ctx).toContain('project')
  })

  it('includes focus area when provided', () => {
    const ctx = buildClaudeMdContext({ focus: 'hooks' })
    expect(ctx).toContain('hooks')
  })

  it('includes scope when set to global', () => {
    const ctx = buildClaudeMdContext({ scope: 'global' })
    expect(ctx).toContain('global')
  })
})
