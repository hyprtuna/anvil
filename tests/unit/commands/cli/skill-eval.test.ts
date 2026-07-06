import { afterEach, describe, expect, it, vi } from 'vitest'
import { skillEvalCommand } from '../../../../src/commands/cli/skill.js'

describe('commands/cli/skill eval', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    writeSpy?.mockRestore()
  })

  it('evaluates a skill and outputs JSON', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillEvalCommand('debugging', { json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed).toHaveProperty('skill', 'debugging')
    expect(parsed).toHaveProperty('score')
    expect(parsed).toHaveProperty('total')
  })

  it('reports score >= 0.8 for debugging', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillEvalCommand('debugging', { json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed.score).toBeGreaterThanOrEqual(0.8)
  })
})
