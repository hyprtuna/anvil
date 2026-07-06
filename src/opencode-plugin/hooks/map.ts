/**
 * OC lifecycle event mapping for Anvil HookKind values.
 *
 * Abort semantics verification (B1.1, D-04):
 * Confirmed via references/oh-my-openagent/src/hooks/write-existing-file-guard/
 * tool-execute-before-handler.ts — throwing from tool.execute.before aborts the
 * tool call. Pattern: `throw new Error("reason")` → OC surfaces the error to the
 * model and does not execute the tool. This is the production pattern used by
 * oh-my-openagent's write-existing-file-guard.
 *
 * Output.output mutability (D-07):
 * Confirmed via references/oh-my-openagent/src/hooks/empty-task-response-detector.ts
 * — mutating output.output in tool.execute.after is the documented pattern.
 *
 * Handler signatures (B1.1):
 * - tool.execute.before: (input: { tool, sessionID, callID }, output: { args, message? }) => Promise<void>
 * - tool.execute.after:  (input: { tool, sessionID, callID }, output: { title, output, metadata }) => Promise<void>
 *
 * Cited references:
 * - references/oh-my-openagent/src/hooks/write-existing-file-guard/tool-execute-before-handler.ts
 * - references/oh-my-openagent/src/hooks/bash-file-read-guard.ts
 * - references/oh-my-openagent/src/hooks/empty-task-response-detector.ts
 *
 * ANV-0040: Both this module's runtime registries and the manifest
 * schema's `HOOK_KIND_TO_OC_EVENT` / `UNMAPPED_OC_HOOKS` are derived
 * from the single source of truth in
 * `src/core/manifest-schema/oc-hook-registry.ts`. The contract test at
 * `tests/unit/core/manifest-schema/oc-hook-registry-contract.test.ts`
 * fails if either consumer drifts.
 */

import {
  OC_HOOK_REGISTRY,
  type OcLifecycleEvent as RegistryLifecycleEvent,
} from '../../core/manifest-schema/oc-hook-registry.js'
import { type HookKind } from '../../core/types.js'

/**
 * OpenCode plugin lifecycle event that receives hook dispatch from
 * the compiled plugin's tool-call handlers. This is the runtime
 * vocabulary (`tool.execute.before` / `tool.execute.after`); see the
 * SoT in `oc-hook-registry.ts` for the full event surface, including
 * the loader-level `config` / `chat.messages.transform` events that
 * are reserved but not currently wired by the runtime.
 */
export type OcLifecycleEvent = Extract<
  RegistryLifecycleEvent,
  'tool.execute.before' | 'tool.execute.after'
>

/**
 * Mapping from HookKind to OpenCode lifecycle event. Derived from
 * `OC_HOOK_REGISTRY`. Only the 11 HookKinds with a tool-call
 * counterpart are present; the remaining 10 are in
 * `OC_OUT_OF_SCOPE_HOOKS`.
 *
 * Source: spec D-01 (.anvil/_archive/docs-anvil/specs/2026-05-03-v0.11.2-bundle-b-opencode-plugin-hooks.md).
 */
export const OC_HOOK_MAP: ReadonlyMap<HookKind, OcLifecycleEvent> = (() => {
  const m = new Map<HookKind, OcLifecycleEvent>()
  for (const [kind, disposition] of OC_HOOK_REGISTRY) {
    if (
      disposition.status === 'mapped' &&
      (disposition.event === 'tool.execute.before' ||
        disposition.event === 'tool.execute.after')
    ) {
      m.set(kind, disposition.event)
    }
  }
  return m
})()

/**
 * HookKinds that have no OpenCode tool-call counterpart. These are
 * either deferred to other OC lifecycle events (loader / chat
 * handlers) or have no equivalent in OC at all. Derived from
 * `OC_HOOK_REGISTRY`.
 *
 * Source: spec D-01 out-of-scope table.
 */
export const OC_OUT_OF_SCOPE_HOOKS: ReadonlySet<HookKind> = (() => {
  const s = new Set<HookKind>()
  for (const [kind, disposition] of OC_HOOK_REGISTRY) {
    if (disposition.status === 'out-of-scope') s.add(kind)
  }
  return s
})()

/**
 * Type-level exhaustiveness check: every HookKind member must appear in
 * exactly one of OC_HOOK_MAP or OC_OUT_OF_SCOPE_HOOKS.
 * This is the compile-time guard; the runtime guard lives in map.test.ts.
 */
export function isOcMapped(kind: HookKind): boolean {
  return OC_HOOK_MAP.has(kind)
}

export function isOcOutOfScope(kind: HookKind): boolean {
  return OC_OUT_OF_SCOPE_HOOKS.has(kind)
}

/**
 * Returns the OC lifecycle event for the given kind, or undefined if
 * the kind is out of scope.
 */
export function getOcLifecycleEvent(
  kind: HookKind,
): OcLifecycleEvent | undefined {
  return OC_HOOK_MAP.get(kind)
}
