import { afterEach, describe, expect, it, vi } from 'vitest'
import { skillSearchCommand } from '../../../../src/commands/cli/skill.js'

describe('commands/cli/skill search', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    writeSpy?.mockRestore()
  })

  it('finds skills by trigger keyword', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillSearchCommand('debug', { json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed).toBeInstanceOf(Array)
    expect(parsed.some((s: { name: string }) => s.name === 'debugging')).toBe(
      true,
    )
  })

  it('finds skills by description substring', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillSearchCommand('refactor', { json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed).toBeInstanceOf(Array)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it('returns empty array when nothing matches', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillSearchCommand('xyznonexistent', { json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed).toEqual([])
  })
})
