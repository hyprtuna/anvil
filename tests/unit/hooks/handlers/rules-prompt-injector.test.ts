import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import {
  rulesPromptInjectorSessionStart,
  rulesPromptInjectorUserPromptSubmit,
} from '../../../../src/hooks/handlers/rules-prompt-injector.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

function makeRuleDir(): string {
  const tmp = createTestTmpDir('rules')
  const dir = join(tmp, '.claude', 'skills', 'universal', 'rules')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'alpha.md'),
    '---\nname: alpha\nkind: meta\n---\n\nbody a\n',
  )
  writeFileSync(
    join(dir, 'beta.md'),
    '---\nname: beta\nkind: meta\n---\n\nbody b\n',
  )
  return tmp
}

describe('hooks/handlers/rules-prompt-injector', () => {
  it('session-start loads rule skill names from the first existing directory', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorSessionStart({
      kind: 'session-start',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: {},
      payload: undefined,
    })
    expect(result.exitCode).toBe(0)
    const rules = (
      result.context as { rules?: { prompt?: Array<{ name: string }> } }
    ).rules?.prompt
    expect(rules?.map((r) => r.name)).toEqual(['alpha', 'beta'])
  })

  it('user-prompt-submit emits a banner with the rule names', async () => {
    const tmp = makeRuleDir()
    const result = await rulesPromptInjectorUserPromptSubmit({
      kind: 'user-prompt-submit',
      cwd: tmp,
      config: buildDefaultConfig(),
      env: {},
      payload: 'anything',
    })
    expect(result.exitCode).toBe(0)
    const banner = (result.context as { rulesPromptBanner?: string })
      .rulesPromptBanner
    expect(banner).toContain('[rules:prompt]')
    expect(banner).toContain('alpha')
    expect(banner).toContain('beta')
  })

  it('falls back silently with exitCode 0 when no rule directory exists', async () => {
    const emptyTmp = createTestTmpDir('rules-empty')
    const result = await rulesPromptInjectorUserPromptSubmit({
      kind: 'user-prompt-submit',
      cwd: emptyTmp,
      config: buildDefaultConfig(),
      env: {},
      payload: 'x',
    })
    expect(result.exitCode).toBe(0)
    // May still find bundled rule skills; the banner is optional on the miss path.
    // Only assert no throw and valid exit code.
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/rules-prompt-injector — HookResult shape', () => {
  it('session-start handler passes HookResult.parse()', async () => {
    const ctx = {
      kind: 'session-start' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: { HOME: '/tmp' },
      payload: null,
    }
    const r = await rulesPromptInjectorSessionStart(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('user-prompt-submit handler passes HookResult.parse() when no rules', async () => {
    const ctx = {
      kind: 'user-prompt-submit' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: { HOME: '/tmp' },
      payload: 'test prompt',
    }
    const r = await rulesPromptInjectorUserPromptSubmit(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
