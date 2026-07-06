import { describe, expect, it } from 'vitest'
import { loadAllAgents } from '../../../src/agents/load-all.js'
import {
  HEADLESS_MODE_BANNER,
  HEADLESS_PASS_CAP,
  HEADLESS_PER_PASS_TOOL_BUDGET,
  prepareInvocation,
} from '../../../src/agents/runner.js'
import { loadConfig } from '../../../src/core/config/load.js'

/**
 * Plan 40 Phase G — ultra-worker `--auto` headless mode.
 *
 * Asserts:
 *   - HEADLESS_MODE_BANNER constant exported with the cap values inline
 *   - prepareInvocation prepends the banner when options.auto = true
 *   - prepareInvocation does NOT prepend when options.auto is omitted/false
 *   - HEADLESS_PASS_CAP = 5; HEADLESS_PER_PASS_TOOL_BUDGET = 20
 *   - ultra-worker agent body documents headless mode
 */

describe('ultra-worker --auto flag (Plan 40 Phase G)', () => {
  it('exposes HEADLESS cap constants', () => {
    expect(HEADLESS_PASS_CAP).toBe(5)
    expect(HEADLESS_PER_PASS_TOOL_BUDGET).toBe(20)
  })

  it('HEADLESS_MODE_BANNER references both caps', () => {
    expect(HEADLESS_MODE_BANNER).toContain('pass-cap: 5')
    expect(HEADLESS_MODE_BANNER).toContain('per-pass tool budget: 20')
    expect(HEADLESS_MODE_BANNER).toContain('<HEADLESS-MODE>')
    expect(HEADLESS_MODE_BANNER).toContain('</HEADLESS-MODE>')
  })

  it('prepareInvocation prepends banner when auto:true', async () => {
    const agents = await loadAllAgents({ agentsRoot: 'agents' })
    const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
    const inv = prepareInvocation(agents, config, 'ultra-worker', 'task X', {
      auto: true,
    })
    expect(inv.prompt.startsWith('<HEADLESS-MODE>')).toBe(true)
    expect(inv.prompt).toContain('pass-cap: 5')
  })

  it('prepareInvocation does NOT prepend banner when auto omitted', async () => {
    const agents = await loadAllAgents({ agentsRoot: 'agents' })
    const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
    const inv = prepareInvocation(agents, config, 'ultra-worker', 'task Y')
    expect(inv.prompt.startsWith('<HEADLESS-MODE>')).toBe(false)
    expect(inv.prompt).not.toContain('pass-cap: 5')
  })

  it('agent body documents headless mode and TODO for v0.10.5+ D-04', async () => {
    // Plan 41 Phase F bumped TODO(v0.10.4 D-04) → TODO(v0.10.5+ D-04) since
    // the banned-tool list was deferred again (no headless-mode dogfood signal yet).
    const { readFileSync } = await import('node:fs')
    const body = readFileSync('agents/ultra-worker.md', 'utf-8')
    expect(body).toContain('## Headless mode (`--auto`)')
    expect(body).toContain('Pass cap:** 5')
    expect(body).toContain('Per-pass tool budget:** 20')
    expect(body).toContain('TODO(v0.10.5+ D-04)')
  })
})
