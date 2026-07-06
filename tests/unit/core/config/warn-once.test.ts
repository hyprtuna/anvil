import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('core/config/warn-once', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('warns on first call for a given absPath', async () => {
    const { warnConfigInvalidOnce } = await import(
      '../../../../src/core/config/warn-once.js'
    )
    warnConfigInvalidOnce(
      '/home/u/.anvil/anvil.config.json',
      'JSON.parse: unexpected token',
      'workflow-config',
    )
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })

  it('stays quiet on second call for the same absPath', async () => {
    const { warnConfigInvalidOnce } = await import(
      '../../../../src/core/config/warn-once.js'
    )
    warnConfigInvalidOnce(
      '/home/u/.anvil/anvil.config.json',
      'parse error',
      'workflow-config',
    )
    warnConfigInvalidOnce(
      '/home/u/.anvil/anvil.config.json',
      'parse error',
      'workflow-config',
    )
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })

  it('warns again for a different absPath', async () => {
    const { warnConfigInvalidOnce } = await import(
      '../../../../src/core/config/warn-once.js'
    )
    warnConfigInvalidOnce(
      '/home/u/.anvil/a.json',
      'parse error',
      'workflow-config',
    )
    warnConfigInvalidOnce(
      '/home/u/.anvil/b.json',
      'parse error',
      'workflow-config',
    )
    expect(stderrSpy).toHaveBeenCalledTimes(2)
  })

  it('emits a message containing kind, source, and absPath', async () => {
    const { warnConfigInvalidOnce } = await import(
      '../../../../src/core/config/warn-once.js'
    )
    warnConfigInvalidOnce(
      '/home/u/.anvil/anvil.config.json',
      'Zod: workflow.agent_redirect must be boolean',
      'workflow-config',
    )
    const msg = stderrSpy.mock.calls[0]?.[0] as string
    expect(msg).toContain('/home/u/.anvil/anvil.config.json')
    expect(msg).toContain('workflow-config')
    expect(msg).toContain('Zod: workflow.agent_redirect must be boolean')
    expect(msg.endsWith('\n')).toBe(true)
  })

  it('truncates source to 240 chars', async () => {
    const { warnConfigInvalidOnce } = await import(
      '../../../../src/core/config/warn-once.js'
    )
    const longSource = 'x'.repeat(500)
    warnConfigInvalidOnce(
      '/home/u/.anvil/long.json',
      longSource,
      'workflow-config',
    )
    const msg = stderrSpy.mock.calls[0]?.[0] as string
    const matchTrunc = msg.match(/x{240}/)
    expect(matchTrunc).toBeTruthy()
    expect(msg).not.toContain('x'.repeat(241))
  })
})
