/**
 * ANV-0040 contract test — guarantees that the OpenCode plugin
 * runtime registry (`OC_HOOK_MAP` + `OC_OUT_OF_SCOPE_HOOKS`) and the
 * manifest schema registry (`HOOK_KIND_TO_OC_EVENT` +
 * `UNMAPPED_OC_HOOKS`) cannot drift. Both are derived from the SoT
 * `OC_HOOK_REGISTRY` in `src/core/manifest-schema/oc-hook-registry.ts`.
 *
 * Removing or moving an entry in the SoT must fail this test.
 */

import { describe, expect, it } from 'vitest'
import { OC_HOOK_REGISTRY } from '../../../../src/core/manifest-schema/oc-hook-registry.js'
import {
  HOOK_KIND_TO_OC_EVENT,
  UNMAPPED_OC_HOOKS,
} from '../../../../src/core/manifest-schema/opencode.js'
import { HookKind } from '../../../../src/core/types.js'
import {
  OC_HOOK_MAP,
  OC_OUT_OF_SCOPE_HOOKS,
} from '../../../../src/opencode-plugin/hooks/map.js'

describe('OC hook registry contract', () => {
  it('SoT covers every HookKind exactly once', () => {
    const allKinds = new Set<string>(HookKind.options)
    expect(OC_HOOK_REGISTRY.size).toBe(allKinds.size)
    for (const kind of allKinds) {
      expect(
        OC_HOOK_REGISTRY.has(kind as HookKind),
        `HookKind '${kind}' missing from OC_HOOK_REGISTRY`,
      ).toBe(true)
    }
  })

  it('runtime ∪ out-of-scope === manifest mapped ∪ unmapped', () => {
    const runtimeUnion = new Set<string>([
      ...[...OC_HOOK_MAP.keys()].map((k) => String(k)),
      ...[...OC_OUT_OF_SCOPE_HOOKS].map((k) => String(k)),
    ])
    const manifestUnion = new Set<string>([
      ...Object.keys(HOOK_KIND_TO_OC_EVENT),
      ...UNMAPPED_OC_HOOKS,
    ])
    expect([...runtimeUnion].sort()).toEqual([...manifestUnion].sort())
  })

  it('runtime mapped kinds are exactly manifest mapped kinds', () => {
    const runtimeMapped = [...OC_HOOK_MAP.keys()].map((k) => String(k)).sort()
    const manifestMapped = Object.keys(HOOK_KIND_TO_OC_EVENT).sort()
    expect(runtimeMapped).toEqual(manifestMapped)
  })

  it('runtime out-of-scope kinds are exactly manifest unmapped kinds', () => {
    const runtimeOos = [...OC_OUT_OF_SCOPE_HOOKS].map((k) => String(k)).sort()
    const manifestUnmapped = [...UNMAPPED_OC_HOOKS].sort()
    expect(runtimeOos).toEqual(manifestUnmapped)
  })

  it('runtime event for a kind matches manifest event for that kind', () => {
    for (const [kind, event] of OC_HOOK_MAP) {
      expect(
        HOOK_KIND_TO_OC_EVENT[kind],
        `manifest disagrees on '${kind}'`,
      ).toBe(event)
    }
  })

  it('mapped and unmapped sets are disjoint on both sides', () => {
    for (const kind of OC_HOOK_MAP.keys()) {
      expect(OC_OUT_OF_SCOPE_HOOKS.has(kind)).toBe(false)
    }
    for (const kind of Object.keys(HOOK_KIND_TO_OC_EVENT)) {
      expect(UNMAPPED_OC_HOOKS.has(kind)).toBe(false)
    }
  })

  it('every HookKind is covered by exactly one disposition', () => {
    for (const kind of HookKind.options) {
      const inMap = OC_HOOK_MAP.has(kind)
      const inOos = OC_OUT_OF_SCOPE_HOOKS.has(kind)
      expect(
        inMap !== inOos,
        `HookKind '${kind}' must be in exactly one set`,
      ).toBe(true)
    }
  })
})
