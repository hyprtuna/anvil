import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  skillListCommand,
  skillSelectCommand,
  skillValidateCommand,
} from '../../../../src/commands/cli/skill.js'

describe('commands/cli/skill', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    writeSpy?.mockRestore()
  })

  it('list emits JSON with skill objects', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillListCommand({ json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed).toBeInstanceOf(Array)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it('select routes "plan this feature" to planning', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillSelectCommand('plan this feature')
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('planning')
  })

  it('validate passes for a shipped skill', async () => {
    await expect(skillValidateCommand('planning')).resolves.not.toThrow()
  })

  it('validate throws for a missing skill', async () => {
    await expect(skillValidateCommand('nonexistent-skill')).rejects.toThrow()
  })
})
