import { describe, expect, it } from 'vitest'
import { buildInitCommand } from '../../../../src/commands/cli/init-command.js'

/**
 * ANV-0114 — the `--allow-large-bundle` flag is registered on `anvil init`
 * and carries a description mentioning the suppression semantics.
 */

describe('anvil init --allow-large-bundle', () => {
  const cmd = buildInitCommand()

  it('declares the flag', () => {
    const opt = cmd.options.find((o) => o.long === '--allow-large-bundle')
    expect(opt).toBeDefined()
  })

  it('describes the suppression behaviour', () => {
    const opt = cmd.options.find((o) => o.long === '--allow-large-bundle')
    expect(opt?.description.toLowerCase()).toContain('suppress')
    expect(opt?.description.toLowerCase()).toContain('expected_tokens')
  })

  it('is a boolean flag (no argument)', () => {
    const opt = cmd.options.find((o) => o.long === '--allow-large-bundle')
    expect(opt?.required).toBe(false)
    expect(opt?.optional).toBe(false)
  })
})
