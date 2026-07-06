import { describe, expect, it } from 'vitest'
import {
  evaluateIf,
  globToRegExp,
  parseRule,
  permissionRuleToMatcher,
} from '../../../src/hooks/match.js'

describe('hooks/match — parseRule', () => {
  it('parses bare tool names (mcp__server__tool form)', () => {
    expect(parseRule('mcp__github__create_issue')).toEqual({
      kind: 'tool',
      tool: 'mcp__github__create_issue',
    })
  })

  it('parses Tool(arg) form', () => {
    expect(parseRule('Bash(git *)')).toEqual({
      kind: 'tool-with-arg',
      tool: 'Bash',
      arg: 'git *',
    })
  })

  it('returns null for empty / malformed rules', () => {
    expect(parseRule('')).toBeNull()
    expect(parseRule('   ')).toBeNull()
    expect(parseRule('Bash(unbalanced')).toEqual({
      kind: 'tool',
      tool: 'Bash(unbalanced',
    })
  })
})

describe('hooks/match — globToRegExp', () => {
  it('* matches any non-slash run when path-like', () => {
    const re = globToRegExp('/src/*.ts')
    expect(re.test('/src/index.ts')).toBe(true)
    expect(re.test('/src/sub/index.ts')).toBe(false)
  })

  it('** matches across path segments', () => {
    const re = globToRegExp('/src/**/*.ts')
    expect(re.test('/src/a/b/c.ts')).toBe(true)
    expect(re.test('/src/a.ts')).toBe(true)
  })

  it('* in non-path glob is greedy', () => {
    const re = globToRegExp('git *')
    expect(re.test('git status')).toBe(true)
    expect(re.test('git rebase --interactive')).toBe(true)
    expect(re.test('gitlab-cli status')).toBe(false) // word boundary
  })

  it('escapes regex metacharacters', () => {
    const re = globToRegExp('foo.bar+baz')
    expect(re.test('foo.bar+baz')).toBe(true)
    expect(re.test('fooXbarYbaz')).toBe(false)
  })
})

describe('hooks/match — permissionRuleToMatcher', () => {
  it('Bash(git *) matches a git command', () => {
    const m = permissionRuleToMatcher('Bash(git *)')
    expect(
      m({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
    ).toBe(true)
    expect(m({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })).toBe(
      false,
    )
  })

  it('Read(/src/**) matches Read on any path under /src/', () => {
    const m = permissionRuleToMatcher('Read(/src/**)')
    expect(
      m({ tool_name: 'Read', tool_input: { file_path: '/src/index.ts' } }),
    ).toBe(true)
    expect(
      m({
        tool_name: 'Read',
        tool_input: { file_path: '/src/deep/nested/x.ts' },
      }),
    ).toBe(true)
    expect(
      m({ tool_name: 'Read', tool_input: { file_path: '/lib/x.ts' } }),
    ).toBe(false)
  })

  it('Skill(*) matches any Skill invocation', () => {
    const m = permissionRuleToMatcher('Skill(*)')
    expect(m({ tool_name: 'Skill', tool_input: { skill: 'planning' } })).toBe(
      true,
    )
    expect(m({ tool_name: 'Skill', tool_input: {} })).toBe(false)
  })

  it('Agent(reviewer) matches by exact agent name', () => {
    const m = permissionRuleToMatcher('Agent(reviewer)')
    expect(
      m({ tool_name: 'Agent', tool_input: { subagent_type: 'reviewer' } }),
    ).toBe(true)
    expect(
      m({ tool_name: 'Agent', tool_input: { subagent_type: 'orchestrator' } }),
    ).toBe(false)
  })

  it('mcp__server__* matches by tool prefix', () => {
    const m = permissionRuleToMatcher('mcp__github__*')
    expect(m({ tool_name: 'mcp__github__create_issue' })).toBe(true)
    expect(m({ tool_name: 'mcp__gitlab__create_issue' })).toBe(false)
  })

  it('returns false for malformed rules instead of throwing', () => {
    const m = permissionRuleToMatcher('')
    expect(m({ tool_name: 'Bash' })).toBe(false)
  })
})

describe('hooks/match — evaluateIf', () => {
  it('absent if-field always matches', () => {
    expect(evaluateIf(undefined, { tool_name: 'Bash' })).toBe(true)
  })

  it('OR semantics across array of rules', () => {
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    }
    expect(evaluateIf(['Bash(git *)', 'Bash(npm *)'], payload)).toBe(true)
    expect(evaluateIf(['Bash(git *)', 'Bash(yarn *)'], payload)).toBe(false)
  })

  it('string form is wrapped to single-rule array', () => {
    expect(
      evaluateIf('Bash(git *)', {
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
      }),
    ).toBe(true)
  })
})
