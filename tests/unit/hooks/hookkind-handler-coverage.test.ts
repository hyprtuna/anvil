import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookKind } from '../../../src/core/types.js'
import { loadAllHooks } from '../../../src/hooks/load-all.js'

describe('HookKind ↔ handler coverage', () => {
  it('every HookKind enum value has at least one registered handler', () => {
    const config = buildDefaultConfig()
    const registry = loadAllHooks({ config })
    const registered = new Set(registry.getAll().map((h) => h.kind))
    const missing = HookKind.options.filter((k) => !registered.has(k))
    expect(missing, `unwired kinds: ${missing.join(', ')}`).toEqual([])
  })

  it('HookKind has exactly 21 values after v0.11.0 trim', () => {
    expect(HookKind.options.length).toBe(21)
  })

  it('removed stub kinds are no longer in the enum', () => {
    const removed = [
      'comment-checker',
      'rules-injector',
      'user-prompt-expansion',
      'permission-denied',
      'file-changed',
      'instructions-loaded',
      'config-change',
      'cwd-changed',
      'worktree-create',
      'worktree-remove',
      'post-compact',
      'task-created',
      'task-completed',
      'elicitation',
      'elicitation-result',
      'stop-failure',
    ] as const
    for (const kind of removed) {
      expect(HookKind.options).not.toContain(kind)
    }
  })
})
