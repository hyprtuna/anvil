import { describe, expect, it } from 'vitest'
import {
  AgentColor,
  AgentFrontmatter,
  AgentModel,
  AgentPermissionMode,
  AgentRole,
  AgentTool,
} from '../../../src/core/types.js'

const BASE_AGENT = {
  name: 'base-agent',
  description: 'preexisting agent',
}

describe('AgentFrontmatter — Claude Code subagent spec', () => {
  it('exposes AgentRole enum with the four canonical roles', () => {
    expect(AgentRole.options).toEqual([
      'orchestrator',
      'worker',
      'verification',
      'researcher',
    ])
  })

  it('AgentModel accepts the CC keywords', () => {
    for (const v of ['sonnet', 'opus', 'haiku', 'inherit']) {
      expect(AgentModel.parse(v)).toBe(v)
    }
  })

  it('AgentModel accepts a full claude-* id', () => {
    expect(AgentModel.parse('claude-opus-4-7')).toBe('claude-opus-4-7')
  })

  it('AgentModel rejects random strings', () => {
    expect(() => AgentModel.parse('gpt-4')).toThrow()
  })

  it('AgentPermissionMode enumerates the 6 CC modes', () => {
    expect(AgentPermissionMode.options).toEqual([
      'default',
      'acceptEdits',
      'auto',
      'dontAsk',
      'bypassPermissions',
      'plan',
    ])
  })

  it('AgentColor enumerates the 8 CC colors', () => {
    expect(AgentColor.options).toEqual([
      'red',
      'blue',
      'green',
      'yellow',
      'purple',
      'orange',
      'pink',
      'cyan',
    ])
  })

  it('AgentTool restricts to the 5 authorized tools', () => {
    expect(AgentTool.options).toEqual(['Read', 'Edit', 'Bash', 'Glob', 'Grep'])
  })

  it('accepts a minimal agent (name + description only; model defaults to inherit)', () => {
    const parsed = AgentFrontmatter.parse(BASE_AGENT)
    expect(parsed.model).toBe('inherit')
    expect(parsed.tools).toEqual([])
    expect(parsed.max_turns).toBe(20)
  })

  it('accepts a full CC-spec agent', () => {
    const parsed = AgentFrontmatter.parse({
      ...BASE_AGENT,
      name: 'code-reviewer',
      description: 'reviews code',
      model: 'opus',
      permissionMode: 'default',
      color: 'purple',
      tools: ['Read', 'Glob', 'Grep'],
      role: 'verification',
      group: 'review',
      trigger: ['review'],
      max_turns: 15,
    })
    expect(parsed.model).toBe('opus')
    expect(parsed.color).toBe('purple')
    expect(parsed.role).toBe('verification')
    expect(parsed.tools).toEqual(['Read', 'Glob', 'Grep'])
  })

  it('parses tools from a comma-separated string (CC accepts both shapes)', () => {
    const parsed = AgentFrontmatter.parse({
      ...BASE_AGENT,
      tools: 'Read, Edit, Bash',
    })
    expect(parsed.tools).toEqual(['Read', 'Edit', 'Bash'])
  })

  it('rejects unknown role / model / permissionMode / color / tools values', () => {
    expect(() =>
      AgentFrontmatter.parse({ ...BASE_AGENT, role: 'specialist' }),
    ).toThrow()
    expect(() =>
      AgentFrontmatter.parse({ ...BASE_AGENT, permissionMode: 'wild' }),
    ).toThrow()
    expect(() =>
      AgentFrontmatter.parse({ ...BASE_AGENT, color: 'fuchsia' }),
    ).toThrow()
    expect(() =>
      AgentFrontmatter.parse({ ...BASE_AGENT, tools: ['Task'] }),
    ).toThrow()
  })
})
