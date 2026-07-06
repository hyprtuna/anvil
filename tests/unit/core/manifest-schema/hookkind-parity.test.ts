import { describe, expect, it } from 'vitest'
import { HOOK_KIND_TO_EVENT } from '../../../../src/core/manifest-schema/claude-code.js'
import { UNMAPPED_OC_HOOKS } from '../../../../src/core/manifest-schema/opencode.js'
import { HookKind } from '../../../../src/core/types.js'

describe('manifest-schema parity with HookKind enum', () => {
  it('claude-code: HOOK_KIND_TO_EVENT keys are a subset of HookKind', () => {
    const ccKeys = Object.keys(HOOK_KIND_TO_EVENT)
    const enumSet = new Set<string>(HookKind.options)
    const stale = ccKeys.filter((k) => !enumSet.has(k))
    expect(stale, `stale CC keys: ${stale.join(', ')}`).toEqual([])
  })

  it('opencode: UNMAPPED_OC_HOOKS values are all in HookKind', () => {
    const enumSet = new Set<string>(HookKind.options)
    const stale = [...UNMAPPED_OC_HOOKS].filter((k) => !enumSet.has(k))
    expect(stale, `stale OC entries: ${stale.join(', ')}`).toEqual([])
  })
})
