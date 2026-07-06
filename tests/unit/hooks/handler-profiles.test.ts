/**
 * ANV-0128 — Hook handler profile manifest tests.
 *
 * Covers:
 *   1. Profile resolution precedence: config > defaultProfile > undefined.
 *   2. Handlers without a manifest continue to work (backward compat).
 *   3. Switching profile via config changes behavior without reinstall.
 *   4. Dispatcher routes the active profile name into ctx.profile.
 *   5. Schema accepts `hooks.<name>.profile`.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import { type HookResult, ModelsConfig } from '../../../src/core/types.js'
import {
  dispatch,
  resolveActiveProfile,
} from '../../../src/hooks/dispatcher.js'

describe('profile resolution (resolveActiveProfile)', () => {
  it('returns the config-supplied profile when set', () => {
    const cfg = buildDefaultConfig()
    cfg.hooks = {
      ...(cfg.hooks ?? {}),
      'memory-validator': { profile: 'strict' },
    }
    const got = resolveActiveProfile('memory-validator', cfg, {
      profiles: { minimal: {}, balanced: {}, strict: {} },
      defaultProfile: 'balanced',
    })
    expect(got).toBe('strict')
  })

  it('falls back to defaultProfile when config is absent', () => {
    const cfg = buildDefaultConfig()
    const got = resolveActiveProfile('memory-validator', cfg, {
      profiles: { minimal: {}, balanced: {}, strict: {} },
      defaultProfile: 'balanced',
    })
    expect(got).toBe('balanced')
  })

  it('returns undefined when handler has no manifest', () => {
    const cfg = buildDefaultConfig()
    const got = resolveActiveProfile('memory-validator', cfg, undefined)
    expect(got).toBeUndefined()
  })

  it('returns undefined when config names a profile that does not exist', () => {
    const cfg = buildDefaultConfig()
    cfg.hooks = {
      ...(cfg.hooks ?? {}),
      'memory-validator': { profile: 'bogus' },
    }
    // Invalid profile: ignore the config and fall through to defaultProfile.
    const got = resolveActiveProfile('memory-validator', cfg, {
      profiles: { minimal: {}, balanced: {} },
      defaultProfile: 'balanced',
    })
    expect(got).toBe('balanced')
  })

  it('returns undefined when manifest has no defaultProfile and config is unset', () => {
    const cfg = buildDefaultConfig()
    const got = resolveActiveProfile('handler-x', cfg, {
      profiles: { a: {}, b: {} },
    })
    expect(got).toBeUndefined()
  })
})

describe('config schema accepts hooks.<name>.profile', () => {
  it('parses memory-validator.profile = strict', () => {
    const raw = {
      ...buildDefaultConfig(),
      hooks: {
        timeout_seconds: 30,
        'memory-validator': { profile: 'strict' },
      },
    }
    const parsed = ModelsConfig.parse(raw)
    expect(parsed.hooks?.['memory-validator']).toEqual({ profile: 'strict' })
  })

  it('preserves existing fields alongside per-handler entries', () => {
    const raw = {
      ...buildDefaultConfig(),
      hooks: {
        timeout_seconds: 45,
        session_start: { budget_chars: 8000 },
        'memory-validator': { profile: 'minimal' },
        'prompt-guard': { profile: 'strict' },
      },
    }
    const parsed = ModelsConfig.parse(raw)
    expect(parsed.hooks?.timeout_seconds).toBe(45)
    expect(parsed.hooks?.session_start?.budget_chars).toBe(8000)
    expect(parsed.hooks?.['memory-validator']).toEqual({ profile: 'minimal' })
    expect(parsed.hooks?.['prompt-guard']).toEqual({ profile: 'strict' })
  })
})

describe('dispatcher routes ctx.profile to handlers with manifests', () => {
  it('handler without manifest sees ctx.profile === undefined', async () => {
    const reg = new HookRegistry()
    let seenProfile: string | undefined = 'sentinel'
    reg.register('legacy', 'pre-commit', async (ctx): Promise<HookResult> => {
      seenProfile = ctx.profile
      return { exitCode: 0 }
    })
    await dispatch(reg, {
      kind: 'pre-commit',
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    })
    expect(seenProfile).toBeUndefined()
  })

  it('handler with manifest receives the resolved active profile', async () => {
    const reg = new HookRegistry()
    let seenProfile: string | undefined
    reg.register(
      'profiled',
      'pre-commit',
      async (ctx): Promise<HookResult> => {
        seenProfile = ctx.profile
        return { exitCode: 0 }
      },
      {
        profileManifest: {
          profiles: { minimal: {}, balanced: {}, strict: {} },
          defaultProfile: 'balanced',
        },
      },
    )
    await dispatch(reg, {
      kind: 'pre-commit',
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    })
    expect(seenProfile).toBe('balanced')
  })

  it('config override flips the active profile without re-register', async () => {
    const reg = new HookRegistry()
    const seen: string[] = []
    reg.register(
      'profiled',
      'pre-commit',
      async (ctx): Promise<HookResult> => {
        seen.push(ctx.profile ?? 'NONE')
        return { exitCode: 0 }
      },
      {
        profileManifest: {
          profiles: { minimal: {}, balanced: {}, strict: {} },
          defaultProfile: 'balanced',
        },
      },
    )
    const cfg = buildDefaultConfig()
    cfg.hooks = { ...(cfg.hooks ?? {}), profiled: { profile: 'strict' } }
    await dispatch(reg, {
      kind: 'pre-commit',
      cwd: '/tmp',
      config: cfg,
      env: {},
      payload: null,
    })
    expect(seen).toEqual(['strict'])
  })
})
