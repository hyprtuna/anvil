import { readFile, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  skillListCommand,
  skillPinCommand,
  skillUnpinCommand,
} from '../../../../src/commands/cli/skill.js'
import { pinsPath } from '../../../../src/core/pins/store.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('commands/cli/skill — pin/unpin', () => {
  let home: string
  let originalHome: string | undefined
  let writeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    home = createTestTmpDir('skill-pin')
    originalHome = process.env.HOME
    process.env.HOME = home
  })

  afterEach(async () => {
    writeSpy?.mockRestore()
    if (originalHome === undefined) process.env.HOME = undefined
    else process.env.HOME = originalHome
    await rm(home, { recursive: true, force: true })
  })

  it('pinCommand persists a valid skill to pins.json', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillPinCommand('planning')
    const raw = await readFile(pinsPath(home), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.pins).toContain('planning')
  })

  it('pinCommand throws for an unknown skill', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await expect(skillPinCommand('nope-not-real')).rejects.toThrow(
      /skill not found/i,
    )
  })

  it('unpinCommand removes a pinned slug', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillPinCommand('planning')
    await skillUnpinCommand('planning')
    const raw = await readFile(pinsPath(home), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.pins).not.toContain('planning')
  })

  it('skill list JSON annotates pinned skills with pinned:true', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillPinCommand('planning')
    writeSpy.mockClear()
    await skillListCommand({ json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output) as Array<{
      name: string
      pinned?: boolean
    }>
    const planning = parsed.find((s) => s.name === 'planning')
    expect(planning?.pinned).toBe(true)
  })

  it('skill list text output includes a Pinned section header when pins exist', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillPinCommand('planning')
    writeSpy.mockClear()
    await skillListCommand({})
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Pinned')
    expect(output).toContain('All skills')
  })

  it('skill list text output omits Pinned header when no pins set', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await skillListCommand({})
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    // The 'Pinned' header sentinel only appears when pinnedRows.length > 0.
    expect(output).not.toMatch(/^Pinned\n/m)
  })
})
