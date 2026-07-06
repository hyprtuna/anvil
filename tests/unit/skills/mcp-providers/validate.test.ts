/**
 * ANV-0037 — validateAvailability reports pass/warn/fail per MCP ref.
 */
import { describe, expect, it } from 'vitest'
import type { SkillMcpServerRef } from '../../../../src/core/types.js'
import { validateAvailability } from '../../../../src/skills/mcp-providers/validate.js'

describe('skills/mcp-providers/validate — validateAvailability', () => {
  it('returns pass when stdio command is on PATH', async () => {
    const refs: SkillMcpServerRef[] = [{ name: 'sh-srv', command: 'sh' }]
    const report = await validateAvailability(refs, {
      whichCheck: (cmd) => Promise.resolve(cmd === 'sh'),
    })
    expect(report.results[0]?.status).toBe('pass')
  })

  it('returns warn when stdio command missing from PATH', async () => {
    const refs: SkillMcpServerRef[] = [
      { name: 'ghost', command: 'definitely-not-on-path-xyz' },
    ]
    const report = await validateAvailability(refs, {
      whichCheck: () => Promise.resolve(false),
    })
    expect(report.results[0]?.status).toBe('warn')
  })

  it('returns warn for transport refs with no url', async () => {
    const refs: SkillMcpServerRef[] = [{ name: 'http-srv', transport: 'sse' }]
    const report = await validateAvailability(refs)
    expect(report.results[0]?.status).toBe('warn')
  })

  it('returns pass for transport refs that declare a url (declare-only)', async () => {
    const refs: SkillMcpServerRef[] = [
      { name: 'http-srv', transport: 'sse', url: 'http://localhost:1' },
    ]
    const report = await validateAvailability(refs)
    expect(report.results[0]?.status).toBe('pass')
  })

  it('aggregates: any warn → overall warn', async () => {
    const refs: SkillMcpServerRef[] = [
      { name: 'a', command: 'sh' },
      { name: 'b', command: 'missing-xyz' },
    ]
    const report = await validateAvailability(refs, {
      whichCheck: (cmd) => Promise.resolve(cmd === 'sh'),
    })
    expect(report.overall).toBe('warn')
  })
})
