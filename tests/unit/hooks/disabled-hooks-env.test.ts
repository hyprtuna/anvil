import { describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { loadAllHooks } from '../../../src/hooks/load-all.js'

describe('hooks/load-all — ANVIL_DISABLED_HOOKS env var (T4.2)', () => {
  it('disables a single hook by name', () => {
    const reg = loadAllHooks({
      config: buildDefaultConfig(),
      env: { ANVIL_DISABLED_HOOKS: 'pre-commit' },
    })
    const preCommit = reg.getAll().find((h) => h.kind === 'pre-commit')
    expect(preCommit?.enabled).toBe(false)
  })

  it('disables multiple hooks when comma-separated', () => {
    const reg = loadAllHooks({
      config: buildDefaultConfig(),
      env: { ANVIL_DISABLED_HOOKS: 'pre-commit,pre-push' },
    })
    const preCommit = reg.getAll().find((h) => h.kind === 'pre-commit')
    const prePush = reg.getAll().find((h) => h.kind === 'pre-push')
    expect(preCommit?.enabled).toBe(false)
    expect(prePush?.enabled).toBe(false)
  })

  it('unions env disables with config.disabled.hooks', () => {
    const cfg = buildDefaultConfig()
    cfg.disabled.hooks = ['pre-commit']
    const reg = loadAllHooks({
      config: cfg,
      env: { ANVIL_DISABLED_HOOKS: 'pre-push' },
    })
    expect(reg.getAll().find((h) => h.kind === 'pre-commit')?.enabled).toBe(
      false,
    )
    expect(reg.getAll().find((h) => h.kind === 'pre-push')?.enabled).toBe(false)
  })

  it('ignores whitespace around tokens', () => {
    const reg = loadAllHooks({
      config: buildDefaultConfig(),
      env: { ANVIL_DISABLED_HOOKS: ' pre-commit , pre-push ' },
    })
    expect(reg.getAll().find((h) => h.kind === 'pre-commit')?.enabled).toBe(
      false,
    )
    expect(reg.getAll().find((h) => h.kind === 'pre-push')?.enabled).toBe(false)
  })

  it('warns on unknown tokens and drops them', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      loadAllHooks({
        config: buildDefaultConfig(),
        env: { ANVIL_DISABLED_HOOKS: 'not-a-real-hook,pre-commit' },
      })
      expect(spy).toHaveBeenCalled()
      expect(String(spy.mock.calls[0]?.[0] ?? '')).toContain('not-a-real-hook')
    } finally {
      spy.mockRestore()
    }
  })

  it('composes with profile=strict (strict otherwise enables all; env can still disable)', () => {
    const reg = loadAllHooks({
      config: buildDefaultConfig(),
      env: {
        ANVIL_HOOK_PROFILE: 'strict',
        ANVIL_DISABLED_HOOKS: 'post-tool-use',
      },
    })
    const postToolUse = reg.getAll().find((h) => h.kind === 'post-tool-use')
    expect(postToolUse?.enabled).toBe(false)
  })

  it('empty env var is a no-op', () => {
    const reg = loadAllHooks({
      config: buildDefaultConfig(),
      env: { ANVIL_DISABLED_HOOKS: '' },
    })
    const preCommit = reg.getAll().find((h) => h.kind === 'pre-commit')
    expect(preCommit?.enabled).toBe(true)
  })
})
