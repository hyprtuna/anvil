import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unmergeStatusLine } from '../../../../src/commands/cli/statusline-install.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('unmergeStatusLine', () => {
  let tmp: string
  let originalHome: string | undefined

  beforeEach(() => {
    tmp = createTestTmpDir('unmerge')
    originalHome = process.env.HOME
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    if (originalHome !== undefined) process.env.HOME = originalHome
  })

  function writeProjectSettings(content: unknown): string {
    const dir = join(tmp, '.claude')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify(content, null, 2))
    return path
  }

  it('returns skipped action when settings.json is absent (project)', async () => {
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatch(/^skipped \(no settings\.json /)
  })

  it('returns skipped action when settings.json is absent (global)', async () => {
    process.env.HOME = tmp
    vi.spyOn({ homedir }, 'homedir').mockReturnValue(tmp)
    // homedir() is captured at module import; rely on tmp HOME.
    const { actions } = await unmergeStatusLine({ scope: 'global', cwd: tmp })
    expect(actions[0]).toMatch(/^skipped \(no settings\.json /)
  })

  it('removes anvil-mode statusLine and writes back', async () => {
    const path = writeProjectSettings({
      statusLine: {
        type: 'command',
        command: '/home/x/.anvil/bin/anvil.cjs statusline',
        padding: 0,
        refreshInterval: 5,
      },
    })
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    expect(actions.some((a) => a.includes('removed statusLine (anvil)'))).toBe(
      true,
    )
    const after = JSON.parse(readFileSync(path, 'utf-8'))
    expect(after.statusLine).toBeUndefined()
  })

  it('removes anvil-shell statusLine', async () => {
    const path = writeProjectSettings({
      statusLine: {
        type: 'command',
        command: 'bash /tmp/x/.claude/statusline-command.sh',
      },
    })
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    expect(
      actions.some((a) => a.includes('removed statusLine (anvil-shell)')),
    ).toBe(true)
    const after = JSON.parse(readFileSync(path, 'utf-8'))
    expect(after.statusLine).toBeUndefined()
  })

  it('keeps custom statusLine and reports it', async () => {
    const path = writeProjectSettings({
      statusLine: { type: 'command', command: '/usr/local/bin/my-status' },
    })
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    expect(actions.some((a) => a.includes('kept statusLine (custom)'))).toBe(
      true,
    )
    const after = JSON.parse(readFileSync(path, 'utf-8'))
    expect(after.statusLine).toBeDefined()
    expect(after.statusLine.command).toBe('/usr/local/bin/my-status')
  })

  it('does nothing on classification "none"', async () => {
    writeProjectSettings({ unrelated: 'value' })
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    // No removed/kept/skipped-mid actions
    expect(
      actions.filter((a) => a.startsWith('removed') || a.startsWith('kept')),
    ).toHaveLength(0)
  })

  it('removes both statusLine and subagentStatusLine when both are anvil', async () => {
    const path = writeProjectSettings({
      statusLine: {
        type: 'command',
        command: '/x/.anvil/bin/anvil.cjs statusline',
      },
      subagentStatusLine: {
        type: 'command',
        command: '/x/.anvil/bin/anvil.cjs statusline subagent',
      },
    })
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    expect(actions.some((a) => a.includes('removed statusLine (anvil)'))).toBe(
      true,
    )
    expect(
      actions.some((a) => a.includes('removed subagentStatusLine (anvil)')),
    ).toBe(true)
    const after = JSON.parse(readFileSync(path, 'utf-8'))
    expect(after.statusLine).toBeUndefined()
    expect(after.subagentStatusLine).toBeUndefined()
  })

  it('keeps custom subagentStatusLine while removing anvil statusLine', async () => {
    const path = writeProjectSettings({
      statusLine: {
        type: 'command',
        command: '/x/.anvil/bin/anvil.cjs statusline',
      },
      subagentStatusLine: {
        type: 'command',
        command: '/usr/local/bin/my-subagent',
      },
    })
    await unmergeStatusLine({ scope: 'project', cwd: tmp })
    const after = JSON.parse(readFileSync(path, 'utf-8'))
    expect(after.statusLine).toBeUndefined()
    expect(after.subagentStatusLine.command).toBe('/usr/local/bin/my-subagent')
  })

  it('skips on malformed JSON', async () => {
    const dir = join(tmp, '.claude')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'settings.json'), '{this is not json')
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    expect(actions[0]).toMatch(/^skipped \(malformed JSON/)
  })

  it('skips on non-object JSON', async () => {
    const dir = join(tmp, '.claude')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'settings.json'), '[1,2,3]')
    const { actions } = await unmergeStatusLine({ scope: 'project', cwd: tmp })
    expect(actions[0]).toMatch(/^skipped \(not a JSON object/)
  })

  it('global scope reads from $HOME/.claude/settings.json', async () => {
    process.env.HOME = tmp
    const dir = join(tmp, '.claude')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'settings.json')
    writeFileSync(
      path,
      JSON.stringify({
        statusLine: {
          type: 'command',
          command: '/x/.anvil/bin/anvil.cjs statusline',
        },
      }),
    )
    const { actions } = await unmergeStatusLine({ scope: 'global', cwd: tmp })
    expect(actions.some((a) => a.includes('removed statusLine (anvil)'))).toBe(
      true,
    )
  })
})
