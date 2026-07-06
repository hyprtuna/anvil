/**
 * ANV-0037 — parseSidecar accepts a list of MCP refs, rejects malformed entries.
 */
import { describe, expect, it } from 'vitest'
import { parseSidecar } from '../../../../src/skills/mcp-providers/parse.js'

describe('skills/mcp-providers/parse — parseSidecar', () => {
  it('parses an array of stdio refs', () => {
    const r = parseSidecar([
      { name: 'graphify', command: 'graphify', args: ['serve'] },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(1)
  })

  it('parses { servers: [...] } envelope shape', () => {
    const r = parseSidecar({
      servers: [{ name: 'mem', transport: 'sse', url: 'http://x' }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value[0]?.name).toBe('mem')
  })

  it('rejects entry missing name', () => {
    const r = parseSidecar([{ command: 'foo' }])
    expect(r.ok).toBe(false)
  })

  it('rejects unknown transport', () => {
    const r = parseSidecar([{ name: 'x', transport: 'websocket' }])
    expect(r.ok).toBe(false)
  })

  it('rejects non-array / non-envelope input', () => {
    const r = parseSidecar('garbage')
    expect(r.ok).toBe(false)
  })
})
