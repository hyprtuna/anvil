/**
 * Phase H — integration: subagent sessions must not receive bootstrap injection
 *
 * Audit MINOR #5 — replaces "manual verification" with automated assertion.
 *
 * This harness drives rulesPromptInjectorUserPromptSubmit and
 * rulesPromptInjectorSessionStart with both subagent and primary payloads, then
 * asserts:
 *   - Subagent: injected prompt contains ZERO <ANVIL-BOOTSTRAP> markers and
 *               ZERO <system-reminder> blocks (i.e. nothing is injected).
 *   - Primary:  injection DOES occur (regression check — guard must not
 *               accidentally silence primary sessions).
 *
 * "Injected prompt" = the combined message + systemInsert of the returned
 * HookResult. The handler is called directly (not via the full dispatcher) so
 * the test remains fast and does not depend on file-system timing logs.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import {
  rulesPromptInjectorSessionStart,
  rulesPromptInjectorUserPromptSubmit,
} from '../../../src/hooks/handlers/rules-prompt-injector.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const tmps: string[] = []

afterEach(() => {
  for (const tmp of tmps.splice(0))
    rmSync(tmp, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function makeRuleDir(): string {
  const tmp = createTestTmpDir('no-boot')
  tmps.push(tmp)
  const dir = join(tmp, '.claude', 'skills', 'universal', 'rules')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'coding-standards.md'),
    '---\nname: coding-standards\nkind: meta\n---\n\nFollow strict TypeScript.\n',
  )
  return tmp
}

/**
 * Collect all text that the handler would inject into Claude's context:
 * the `message` (user-visible, often carries banners) and `systemInsert`
 * (model-visible context). This is what we assert is free of bootstrap markers
 * for subagent sessions.
 */
function collectInjected(result: {
  message?: string
  systemInsert?: string
}): string {
  return [result.message ?? '', result.systemInsert ?? ''].join('\n')
}

// ---------------------------------------------------------------------------
// Subagent path — zero bootstrap markers
// ---------------------------------------------------------------------------

describe('subagent sessions — zero bootstrap injection', () => {
  it('session_type=subagent: no <ANVIL-BOOTSTRAP> or <system-reminder> injected (user-prompt-submit)', async () => {
    const tmp = makeRuleDir()
    // Silence stderr <SUBAGENT-STOP> marker during the test
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const result = await rulesPromptInjectorUserPromptSubmit({
      kind: 'user-prompt-submit',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: {},
      payload: {
        session_type: 'subagent',
        prompt: 'implement the researcher agent',
      },
    })

    stderrSpy.mockRestore()

    const injected = collectInjected(result)
    expect(injected).not.toContain('<ANVIL-BOOTSTRAP>')
    expect(injected).not.toContain('<system-reminder')
    expect(result.exitCode).toBe(0)
    expect(result.message).toBeUndefined()
    expect(result.systemInsert).toBeUndefined()
  })

  it('ANVIL_AGENT_MODE=subagent: no <ANVIL-BOOTSTRAP> or <system-reminder> injected (user-prompt-submit)', async () => {
    const tmp = makeRuleDir()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const result = await rulesPromptInjectorUserPromptSubmit({
      kind: 'user-prompt-submit',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: { ANVIL_AGENT_MODE: 'subagent' },
      payload: { prompt: 'implement the researcher agent' },
    })

    stderrSpy.mockRestore()

    const injected = collectInjected(result)
    expect(injected).not.toContain('<ANVIL-BOOTSTRAP>')
    expect(injected).not.toContain('<system-reminder')
    expect(result.exitCode).toBe(0)
  })

  it('session_type=subagent: session-start also returns early — no bootstrap context', async () => {
    const tmp = makeRuleDir()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const result = await rulesPromptInjectorSessionStart({
      kind: 'session-start',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: {},
      payload: { session_type: 'subagent' },
    })

    stderrSpy.mockRestore()

    // No rules context loaded for subagents
    expect(result.context).toBeUndefined()
    // No text injection
    const injected = collectInjected(result)
    expect(injected).not.toContain('<ANVIL-BOOTSTRAP>')
    expect(injected).not.toContain('<system-reminder')
  })
})

// ---------------------------------------------------------------------------
// Primary path — injection proceeds (regression check)
// ---------------------------------------------------------------------------

describe('primary sessions — injection proceeds (regression check)', () => {
  it('session_type=primary: banner IS injected (rules context loaded)', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit({
      kind: 'user-prompt-submit',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: {},
      payload: {
        session_type: 'primary',
        prompt: 'implement the researcher agent',
      },
    })

    expect(result.exitCode).toBe(0)
    // At minimum, the rules banner must be populated in context
    const ctx = result.context as { rulesPromptBanner?: string } | undefined
    expect(ctx?.rulesPromptBanner).toBeDefined()
    expect(ctx?.rulesPromptBanner).toContain('coding-standards')
  })

  it('no session_type (default primary): banner IS injected', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit({
      kind: 'user-prompt-submit',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: {},
      payload: { prompt: 'implement the researcher agent' },
    })

    expect(result.exitCode).toBe(0)
    const ctx = result.context as { rulesPromptBanner?: string } | undefined
    expect(ctx?.rulesPromptBanner).toBeDefined()
    expect(ctx?.rulesPromptBanner).toContain('coding-standards')
  })

  it('session-start with primary session: rules context IS loaded', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorSessionStart({
      kind: 'session-start',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: {},
      payload: { session_type: 'primary' },
    })

    expect(result.exitCode).toBe(0)
    const rules = (
      result.context as { rules?: { prompt?: Array<{ name: string }> } }
    )?.rules?.prompt
    expect(rules).toBeDefined()
    expect(rules?.length).toBeGreaterThan(0)
    expect(rules?.map((r) => r.name)).toContain('coding-standards')
  })
})
