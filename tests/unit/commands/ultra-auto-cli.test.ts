import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * Plan 40 Phase G — `anvil ultra --auto` CLI flag.
 *
 * Asserts the CLI parses --auto and that the help/output reflects the flag.
 * Does not actually invoke the agent runtime — just verifies the option is
 * registered and propagates through the dry-run prompt rendering.
 */

const BIN = './bin/anvil.cjs'

describe('anvil ultra --auto CLI flag (Plan 40 Phase G)', () => {
  it('--help lists --auto', () => {
    const r = spawnSync(BIN, ['ultra', '--help'], { encoding: 'utf-8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--auto')
    expect(r.stdout).toContain('headless mode')
  })

  it('emits the headless banner in stdout when --auto is passed', () => {
    const r = spawnSync(BIN, ['ultra', '--auto', 'demo task'], {
      encoding: 'utf-8',
    })
    // The command prints the rendered prompt; should contain the banner
    // (identifiable by the cap text "pass-cap: 5" only present in the
    // runner-injected banner, not the agent-body documentation).
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--auto headless mode ON')
    expect(r.stdout).toContain('pass-cap: 5')
  })

  it('does NOT emit the headless banner without --auto', () => {
    const r = spawnSync(BIN, ['ultra', 'demo task'], { encoding: 'utf-8' })
    expect(r.status).toBe(0)
    expect(r.stdout).not.toContain('--auto headless mode ON')
    // The agent body documents headless mode, so the literal token
    // \`<HEADLESS-MODE>\` appears in code-block context. The runner-injected
    // banner is identifiable by the cap text "pass-cap: 5" (lowercase form,
    // distinct from the body's "Pass cap:** 5").
    expect(r.stdout).not.toContain('pass-cap: 5')
  })
})
