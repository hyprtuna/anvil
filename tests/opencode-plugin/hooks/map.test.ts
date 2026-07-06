import { describe, expect, it } from 'vitest'
import { HookKind } from '../../../src/core/types.js'
import {
  OC_HOOK_MAP,
  OC_OUT_OF_SCOPE_HOOKS,
  getOcLifecycleEvent,
  isOcMapped,
  isOcOutOfScope,
} from '../../../src/opencode-plugin/hooks/map.js'

describe('OC HookKind map', () => {
  const allKinds = HookKind.options

  it('covers every HookKind in exactly one of OC_HOOK_MAP or OC_OUT_OF_SCOPE_HOOKS', () => {
    for (const kind of allKinds) {
      const inMap = OC_HOOK_MAP.has(kind)
      const inOos = OC_OUT_OF_SCOPE_HOOKS.has(kind)
      expect(
        inMap !== inOos,
        `HookKind '${kind}' must be in exactly one of OC_HOOK_MAP or OC_OUT_OF_SCOPE_HOOKS (inMap=${inMap}, inOos=${inOos})`,
      ).toBe(true)
    }
  })

  it('no HookKind appears in both sets', () => {
    for (const kind of allKinds) {
      expect(
        OC_HOOK_MAP.has(kind) && OC_OUT_OF_SCOPE_HOOKS.has(kind),
        `HookKind '${kind}' appears in both sets`,
      ).toBe(false)
    }
  })

  it('maps pre-tool-use, read-guard, prompt-guard, workflow-guard to tool.execute.before', () => {
    expect(OC_HOOK_MAP.get('pre-tool-use')).toBe('tool.execute.before')
    expect(OC_HOOK_MAP.get('read-guard')).toBe('tool.execute.before')
    expect(OC_HOOK_MAP.get('prompt-guard')).toBe('tool.execute.before')
    expect(OC_HOOK_MAP.get('workflow-guard')).toBe('tool.execute.before')
  })

  it('maps post-tool-use, post-edit, on-large-output, context-monitor, on-error, phase-boundary, notification to tool.execute.after', () => {
    expect(OC_HOOK_MAP.get('post-tool-use')).toBe('tool.execute.after')
    expect(OC_HOOK_MAP.get('post-edit')).toBe('tool.execute.after')
    expect(OC_HOOK_MAP.get('on-large-output')).toBe('tool.execute.after')
    expect(OC_HOOK_MAP.get('context-monitor')).toBe('tool.execute.after')
    expect(OC_HOOK_MAP.get('on-error')).toBe('tool.execute.after')
    expect(OC_HOOK_MAP.get('phase-boundary')).toBe('tool.execute.after')
    expect(OC_HOOK_MAP.get('notification')).toBe('tool.execute.after')
  })

  it('marks session-start, session-end, user-prompt-submit, pre-compact, stop, subagent-stop as out of scope', () => {
    const deferredKinds = [
      'session-start',
      'session-end',
      'user-prompt-submit',
      'pre-compact',
      'stop',
      'subagent-stop',
    ] as const
    for (const kind of deferredKinds) {
      expect(
        OC_OUT_OF_SCOPE_HOOKS.has(kind),
        `'${kind}' should be out of scope`,
      ).toBe(true)
    }
  })

  it('marks git/editor-lifecycle hooks as out of scope', () => {
    const outsideKinds = [
      'post-test-run',
      'pre-commit',
      'pre-push',
      'on-pr-open',
    ] as const
    for (const kind of outsideKinds) {
      expect(
        OC_OUT_OF_SCOPE_HOOKS.has(kind),
        `'${kind}' should be out of scope`,
      ).toBe(true)
    }
  })

  it('getOcLifecycleEvent returns the event for mapped kinds', () => {
    expect(getOcLifecycleEvent('pre-tool-use')).toBe('tool.execute.before')
    expect(getOcLifecycleEvent('notification')).toBe('tool.execute.after')
  })

  it('getOcLifecycleEvent returns undefined for out-of-scope kinds', () => {
    expect(getOcLifecycleEvent('session-start')).toBeUndefined()
    expect(getOcLifecycleEvent('pre-commit')).toBeUndefined()
  })

  it('isOcMapped and isOcOutOfScope are mutually exclusive for all kinds', () => {
    for (const kind of allKinds) {
      expect(isOcMapped(kind)).toBe(!isOcOutOfScope(kind))
    }
  })

  it('total mapped count is 11 and out-of-scope count is 10', () => {
    expect(OC_HOOK_MAP.size).toBe(11)
    expect(OC_OUT_OF_SCOPE_HOOKS.size).toBe(10)
    expect(OC_HOOK_MAP.size + OC_OUT_OF_SCOPE_HOOKS.size).toBe(allKinds.length)
  })
})
