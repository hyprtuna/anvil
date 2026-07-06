import { describe, expect, it } from 'vitest'
import { HOOK_KIND_TO_EVENT } from '../../../../src/core/manifest-schema/claude-code.js'
import { HookKind } from '../../../../src/core/types.js'

/**
 * Canonical Layer A hook kinds — Claude Code lifecycle events. Every
 * Layer-A kind MUST appear in HOOK_KIND_TO_EVENT; every key in
 * HOOK_KIND_TO_EVENT MUST be a Layer-A kind.
 *
 * Everything else in HookKind is Layer B — Anvil-internal lifecycle stages
 * (pre-commit, post-edit, workflow-guard, etc.) that never reach Claude
 * Code's plugin manifest.
 *
 * v0.11.0 trimmed the Plan 28 D1 stub kinds (no handlers shipped); the
 * CC mapping is back to the 9 native events.
 */
const LAYER_A_KINDS = new Set([
  'session-start',
  'session-end',
  'user-prompt-submit',
  'pre-tool-use',
  'post-tool-use',
  'pre-compact',
  'notification',
  'stop',
  'subagent-stop',
] as const)

describe('core/manifest-schema/hook-kind-parity (T4.7)', () => {
  const validHookKinds = new Set<string>(HookKind.options)

  it('every key in HOOK_KIND_TO_EVENT is a member of HookKind', () => {
    const missing: string[] = []
    for (const key of Object.keys(HOOK_KIND_TO_EVENT)) {
      if (!validHookKinds.has(key)) missing.push(key)
    }
    expect(missing).toEqual([])
  })

  it('every Layer-A HookKind appears in HOOK_KIND_TO_EVENT', () => {
    const missing: string[] = []
    for (const kind of LAYER_A_KINDS) {
      if (!(kind in HOOK_KIND_TO_EVENT)) missing.push(kind)
    }
    expect(missing).toEqual([])
  })

  it('every Layer-B HookKind is ABSENT from HOOK_KIND_TO_EVENT', () => {
    const leaking: string[] = []
    for (const kind of HookKind.options) {
      if (!LAYER_A_KINDS.has(kind as never) && kind in HOOK_KIND_TO_EVENT) {
        leaking.push(kind)
      }
    }
    expect(leaking).toEqual([])
  })

  it('pre-tool-use binds to PreToolUse (G-8 regression)', () => {
    expect(HOOK_KIND_TO_EVENT['pre-tool-use']).toBe('PreToolUse')
  })

  it('v0.2.0 stub events notification / stop / subagent-stop are mapped', () => {
    expect(HOOK_KIND_TO_EVENT.notification).toBe('Notification')
    expect(HOOK_KIND_TO_EVENT.stop).toBe('Stop')
    expect(HOOK_KIND_TO_EVENT['subagent-stop']).toBe('SubagentStop')
  })

  it('HOOK_KIND_TO_EVENT has exactly the documented Layer-A mappings (no drift)', () => {
    expect(Object.keys(HOOK_KIND_TO_EVENT).sort()).toEqual(
      [...LAYER_A_KINDS].sort(),
    )
  })
})
