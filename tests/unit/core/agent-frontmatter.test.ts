import { describe, expect, it } from 'vitest'
import {
  AgentFrontmatter,
  AgentIsolation,
  AgentMemory,
} from '../../../src/core/types.js'

const BASE = {
  name: 'sample-agent',
  description: 'sample description',
}

describe('AgentFrontmatter — Plan 28 H1 optional fields', () => {
  it('treats every new optional field as undefined when omitted', () => {
    const parsed = AgentFrontmatter.parse(BASE)
    expect(parsed.disallowedTools).toBeUndefined()
    expect(parsed.skills).toBeUndefined()
    expect(parsed.memory).toBeUndefined()
    expect(parsed.mcpServers).toBeUndefined()
    expect(parsed.hooks).toBeUndefined()
    expect(parsed.background).toBeUndefined()
    expect(parsed.isolation).toBeUndefined()
    expect(parsed.initialPrompt).toBeUndefined()
  })

  it('accepts a valid disallowedTools list', () => {
    const parsed = AgentFrontmatter.parse({
      ...BASE,
      tools: ['Read', 'Edit'],
      disallowedTools: ['Edit'],
    })
    expect(parsed.disallowedTools).toEqual(['Edit'])
  })

  it('rejects a disallowedTools entry outside the AgentTool enum', () => {
    expect(() =>
      AgentFrontmatter.parse({ ...BASE, disallowedTools: ['Task'] }),
    ).toThrow()
  })

  it('accepts every memory enum value', () => {
    for (const v of AgentMemory.options) {
      const parsed = AgentFrontmatter.parse({ ...BASE, memory: v })
      expect(parsed.memory).toBe(v)
    }
  })

  it('rejects an invalid memory value', () => {
    expect(() =>
      AgentFrontmatter.parse({ ...BASE, memory: 'global' }),
    ).toThrow()
  })

  it('accepts mcpServers in mixed string and inline-object form', () => {
    const parsed = AgentFrontmatter.parse({
      ...BASE,
      mcpServers: [
        'shared-search',
        { name: 'local-fs', command: 'mcp-fs', args: ['--root', '/tmp'] },
        { name: 'minimal', command: 'mcp-min' },
      ],
    })
    expect(parsed.mcpServers).toBeDefined()
    expect(parsed.mcpServers).toHaveLength(3)
    expect(parsed.mcpServers?.[0]).toBe('shared-search')
    expect(parsed.mcpServers?.[1]).toEqual({
      name: 'local-fs',
      command: 'mcp-fs',
      args: ['--root', '/tmp'],
    })
    expect(parsed.mcpServers?.[2]).toEqual({
      name: 'minimal',
      command: 'mcp-min',
    })
  })

  it('rejects an invalid isolation value', () => {
    expect(() =>
      AgentFrontmatter.parse({ ...BASE, isolation: 'sandbox' }),
    ).toThrow()
    // Sanity: `worktree` IS accepted today.
    expect(AgentIsolation.options).toEqual(['worktree'])
    expect(
      AgentFrontmatter.parse({ ...BASE, isolation: 'worktree' }).isolation,
    ).toBe('worktree')
  })

  it('accepts hooks as a loose unknown[] (full schema deferred)', () => {
    const parsed = AgentFrontmatter.parse({
      ...BASE,
      hooks: [{ event: 'post-tool-use' }, 'string-form-allowed', 42],
    })
    expect(parsed.hooks).toHaveLength(3)
  })

  it('accepts background, skills, initialPrompt together', () => {
    const parsed = AgentFrontmatter.parse({
      ...BASE,
      background: true,
      skills: ['evidence-before-assertion', 'tdd-iron-law'],
      initialPrompt: 'Begin exploration of the auth module.',
    })
    expect(parsed.background).toBe(true)
    expect(parsed.skills).toEqual(['evidence-before-assertion', 'tdd-iron-law'])
    expect(parsed.initialPrompt).toBe('Begin exploration of the auth module.')
  })
})
