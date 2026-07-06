import { afterEach, describe, expect, it, vi } from 'vitest'
import { skillListCommand } from '../../../../src/commands/cli/skill.js'

/**
 * Plan 44 Phase C — `anvil skill list --verbose` surfaces provenance.
 *
 * Default text output adds Source / Conf columns when --verbose is set.
 * JSON output (--json) always includes the provenance triple so downstream
 * consumers don't need a flag dance.
 */

describe('skill list --verbose (Plan 44 Phase C)', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    writeSpy?.mockRestore()
  })

  it('text output without --verbose does NOT include Source / Conf columns', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillListCommand({})
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).not.toContain('Source')
    expect(output).not.toContain('Conf')
  })

  it('text output with --verbose adds Source / Conf columns', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillListCommand({ verbose: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Source')
    expect(output).toContain('Conf')
    // Synthesis: every shipped skill is 'authored'
    expect(output).toContain('authored')
  })

  it('JSON output always includes source / confidence fields', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillListCommand({ json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output) as Array<{
      name: string
      source?: string
      confidence?: number
    }>
    expect(parsed.length).toBeGreaterThan(0)
    // Every shipped skill received synthesized source via the loader.
    for (const row of parsed) {
      expect(row.source).toBeDefined()
      // confidence is 1.0 for authored, undefined for unknown
      if (row.source === 'authored') {
        expect(row.confidence).toBe(1.0)
      }
    }
  })
})
