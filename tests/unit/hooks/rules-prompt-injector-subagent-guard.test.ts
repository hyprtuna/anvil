/**
 * Phase H — unit tests for the <SUBAGENT-STOP> guard in rules-prompt-injector
 *
 * Covers 4 cases:
 *   1. payload.session_type === 'subagent' → handler returns early; no injection
 *   2. payload.session_type === 'primary'  → injection occurs (Phase E behaviour preserved)
 *   3. ctx.env.ANVIL_AGENT_MODE === 'subagent' → handler returns early; no injection
 *   4. ctx.env.ANVIL_AGENT_MODE === 'primary'  → injection occurs
 *   5. <SUBAGENT-STOP> marker appears in process.stderr when guard triggers
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  const tmp = createTestTmpDir('rpi-guard')
  tmps.push(tmp)
  const dir = join(tmp, '.claude', 'skills', 'universal', 'rules')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'alpha.md'),
    '---\nname: alpha\nkind: meta\n---\n\nbody a\n',
  )
  return tmp
}

function makeCtx(
  payload: unknown,
  env: Record<string, string> = {},
  cwd?: string,
) {
  return {
    kind: 'user-prompt-submit' as const,
    cwd: cwd ?? createTestTmpDir('rpi-cwd'),
    config: buildDefaultConfig(),
    env,
    payload,
  }
}

function makeSessionCtx(
  payload: unknown,
  env: Record<string, string> = {},
  cwd?: string,
) {
  return {
    kind: 'session-start' as const,
    cwd: cwd ?? createTestTmpDir('rpi-cwd'),
    config: buildDefaultConfig(),
    env,
    payload,
  }
}

// ---------------------------------------------------------------------------
// 1. session_type = 'subagent' → short-circuit; no injection
// ---------------------------------------------------------------------------

describe('<SUBAGENT-STOP> guard — session_type field', () => {
  it('session_type=subagent: rulesPromptInjectorUserPromptSubmit returns early — no banner, no systemInsert', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit(
      makeCtx({ session_type: 'subagent', prompt: 'hello' }, {}, tmp),
    )
    expect(result.exitCode).toBe(0)
    expect(result.message).toBeUndefined()
    expect(result.systemInsert).toBeUndefined()
    // No context injection either
    expect(result.context).toBeUndefined()
  })

  it('session_type=subagent: rulesPromptInjectorSessionStart also returns early — no rules context', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorSessionStart(
      makeSessionCtx({ session_type: 'subagent' }, {}, tmp),
    )
    expect(result.exitCode).toBe(0)
    expect(result.context).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // 2. session_type = 'primary' → injection proceeds
  // ---------------------------------------------------------------------------

  it('session_type=primary: injection proceeds — banner is present', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit(
      makeCtx({ session_type: 'primary', prompt: 'implement foo' }, {}, tmp),
    )
    expect(result.exitCode).toBe(0)
    // Banner must reference the rule we planted
    const banner = (result.context as { rulesPromptBanner?: string })
      ?.rulesPromptBanner
    expect(banner).toBeDefined()
    expect(banner).toContain('alpha')
  })

  it('session_type absent: injection proceeds (default-deny guard)', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit(
      makeCtx({ prompt: 'implement foo' }, {}, tmp),
    )
    expect(result.exitCode).toBe(0)
    const banner = (result.context as { rulesPromptBanner?: string })
      ?.rulesPromptBanner
    expect(banner).toBeDefined()
    expect(banner).toContain('alpha')
  })
})

// ---------------------------------------------------------------------------
// 3. ANVIL_AGENT_MODE = 'subagent' → short-circuit; no injection
// ---------------------------------------------------------------------------

describe('<SUBAGENT-STOP> guard — ANVIL_AGENT_MODE env', () => {
  it('ANVIL_AGENT_MODE=subagent: returns early — no banner, no systemInsert', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit(
      makeCtx({ prompt: 'hello' }, { ANVIL_AGENT_MODE: 'subagent' }, tmp),
    )
    expect(result.exitCode).toBe(0)
    expect(result.message).toBeUndefined()
    expect(result.systemInsert).toBeUndefined()
    expect(result.context).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // 4. ANVIL_AGENT_MODE = 'primary' → injection proceeds
  // ---------------------------------------------------------------------------

  it('ANVIL_AGENT_MODE=primary: injection proceeds — banner is present', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit(
      makeCtx(
        { prompt: 'implement bar' },
        { ANVIL_AGENT_MODE: 'primary' },
        tmp,
      ),
    )
    expect(result.exitCode).toBe(0)
    const banner = (result.context as { rulesPromptBanner?: string })
      ?.rulesPromptBanner
    expect(banner).toBeDefined()
    expect(banner).toContain('alpha')
  })
})

// ---------------------------------------------------------------------------
// 5. <SUBAGENT-STOP> marker emitted to stderr when guard triggers
// ---------------------------------------------------------------------------

describe('<SUBAGENT-STOP> marker in stderr', () => {
  let stderrOutput = ''
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stderrOutput = ''
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
      stderrOutput +=
        typeof s === 'string' ? s : Buffer.from(s as Buffer).toString()
      return true
    })
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('emits <SUBAGENT-STOP> to stderr when session_type=subagent', async () => {
    const tmp = makeRuleDir()
    await rulesPromptInjectorUserPromptSubmit(
      makeCtx({ session_type: 'subagent', prompt: 'hi' }, {}, tmp),
    )
    expect(stderrOutput).toContain('<SUBAGENT-STOP>')
  })

  it('emits <SUBAGENT-STOP> to stderr when ANVIL_AGENT_MODE=subagent', async () => {
    const tmp = makeRuleDir()
    await rulesPromptInjectorUserPromptSubmit(
      makeCtx({ prompt: 'hi' }, { ANVIL_AGENT_MODE: 'subagent' }, tmp),
    )
    expect(stderrOutput).toContain('<SUBAGENT-STOP>')
  })

  it('does NOT emit <SUBAGENT-STOP> for primary sessions', async () => {
    const tmp = makeRuleDir()
    await rulesPromptInjectorUserPromptSubmit(
      makeCtx({ session_type: 'primary', prompt: 'hi' }, {}, tmp),
    )
    expect(stderrOutput).not.toContain('<SUBAGENT-STOP>')
  })
})
