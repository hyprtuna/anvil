/**
 * ANV-0037 — SkillFrontmatter accepts optional MCP + context-provider fields.
 */
import { describe, expect, it } from 'vitest'
import {
  ContextProviderRef,
  SkillFrontmatter,
  SkillMcpServerRef,
} from '../../../src/core/types.js'

const base = {
  name: 'demo',
  kind: 'atomic',
  group: 'development',
  description: 'd',
  preferred_model: 'claude-sonnet-4-6',
  preferred_effort: 'medium',
} as const

describe('SkillFrontmatter — mcp_servers + context_providers', () => {
  it('parses skill with neither field (back-compat)', () => {
    const res = SkillFrontmatter.safeParse({ ...base })
    expect(res.success).toBe(true)
  })

  it('parses skill with stdio MCP server', () => {
    const res = SkillFrontmatter.safeParse({
      ...base,
      mcp_servers: [{ name: 'graphify', command: 'graphify', args: ['serve'] }],
    })
    expect(res.success).toBe(true)
  })

  it('parses skill with transport MCP server', () => {
    const res = SkillFrontmatter.safeParse({
      ...base,
      mcp_servers: [
        { name: 'mem', transport: 'sse', url: 'http://localhost:1234' },
      ],
    })
    expect(res.success).toBe(true)
  })

  it('parses skill with context_providers', () => {
    const res = SkillFrontmatter.safeParse({
      ...base,
      context_providers: [
        { kind: 'memory', name: 'claude-mem' },
        { kind: 'codegraph', name: 'graphify', config: { mode: 'lite' } },
      ],
    })
    expect(res.success).toBe(true)
  })

  it('rejects MCP entry missing name', () => {
    const res = SkillMcpServerRef.safeParse({ command: 'foo' })
    expect(res.success).toBe(false)
  })

  it('rejects MCP entry with unknown transport', () => {
    const res = SkillMcpServerRef.safeParse({
      name: 'x',
      transport: 'websocket',
    })
    expect(res.success).toBe(false)
  })

  it('rejects context provider with unknown kind', () => {
    const res = ContextProviderRef.safeParse({ kind: 'graph', name: 'foo' })
    expect(res.success).toBe(false)
  })
})
