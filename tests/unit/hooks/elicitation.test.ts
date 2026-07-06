/**
 * ANV-0037 — Elicitation / ElicitationResult event types + mcp_tool handler kind.
 */
import { describe, expect, it } from 'vitest'
import {
  Elicitation,
  ElicitationResult,
  ToolHandlerKind,
} from '../../../src/core/types.js'
import {
  registerElicitationHandler,
  resetElicitationRegistry,
} from '../../../src/hooks/elicitation/index.js'

describe('hooks/elicitation — types + registry', () => {
  it('Elicitation schema parses a valid event', () => {
    const e = Elicitation.parse({
      type: 'elicitation',
      serverName: 'srv',
      toolName: 'tool',
      prompt: 'please provide X',
    })
    expect(e.type).toBe('elicitation')
  })

  it('ElicitationResult schema parses a cancelled result', () => {
    const r = ElicitationResult.parse({
      type: 'elicitation-result',
      serverName: 'srv',
      toolName: 'tool',
      cancelled: true,
    })
    expect(r.cancelled).toBe(true)
  })

  it('ToolHandlerKind enumerates mcp_tool', () => {
    expect(ToolHandlerKind.options).toContain('mcp_tool')
    expect(ToolHandlerKind.options).toContain('builtin')
  })

  it('registerElicitationHandler returns a subscription with unsubscribe', () => {
    resetElicitationRegistry()
    const sub = registerElicitationHandler(async (event) => ({
      type: 'elicitation-result',
      serverName: event.serverName,
      toolName: event.toolName,
      cancelled: false,
      value: 'ok',
    }))
    expect(typeof sub.unsubscribe).toBe('function')
    sub.unsubscribe()
  })
})
