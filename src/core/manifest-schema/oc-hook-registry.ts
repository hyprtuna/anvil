/**
 * Single source of truth for Anvil ↔ OpenCode hook routing.
 *
 * ANV-0040: Prior to this module the OC plugin runtime
 * (`src/opencode-plugin/hooks/map.ts`) and the manifest schema
 * (`src/core/manifest-schema/opencode.ts`) maintained two independent
 * string-literal registries. They drifted: the runtime mapped 11
 * HookKinds to lifecycle events while the manifest declared those
 * same kinds as `unmapped`, so doctor diagnostics, generated docs, and
 * install dry-run lied about which hooks reach OpenCode.
 *
 * Both downstream modules now derive their shapes from
 * `OC_HOOK_REGISTRY` below. The contract test in
 * `tests/unit/core/manifest-schema/oc-hook-registry-contract.test.ts`
 * fails if any consumer drifts away from this constant.
 *
 * Layer note: this module is layer 0 (core). It is imported by both
 * the layer-0 manifest schema and the layer-5 OC plugin runtime.
 */

import type { HookKind } from '../types.js'

/**
 * OpenCode plugin lifecycle events Anvil's hook dispatcher can wire
 * into. The first two are tool-call lifecycle events fired by the
 * compiled OC plugin; the last two are loader-level events Anvil
 * never registers but reserves so doctor / docs / dry-run can list
 * them as "deferred" instead of "unknown".
 */
export type OcLifecycleEvent =
  | 'tool.execute.before'
  | 'tool.execute.after'
  | 'config'
  | 'chat.messages.transform'

/** Disposition of a HookKind on the OpenCode side. */
export type OcHookDisposition =
  | { status: 'mapped'; event: OcLifecycleEvent }
  | { status: 'out-of-scope' }

/**
 * Canonical registry. Every HookKind appears exactly once; the
 * exhaustiveness invariant is enforced by the contract test (which
 * iterates `HookKind.options` and asserts coverage).
 *
 * To add or change a wiring: edit ONLY this constant. Both downstream
 * registries (`OC_HOOK_MAP` + `OC_OUT_OF_SCOPE_HOOKS` in the runtime,
 * `HOOK_KIND_TO_OC_EVENT` + `UNMAPPED_OC_HOOKS` in the manifest
 * schema) are derived from it.
 *
 * Source: spec D-01 (.anvil/_archive/docs-anvil/specs/2026-05-03-v0.11.2-bundle-b-opencode-plugin-hooks.md).
 */
export const OC_HOOK_REGISTRY: ReadonlyMap<HookKind, OcHookDisposition> =
  new Map<HookKind, OcHookDisposition>([
    // ── tool.execute.before (blocking) ────────────────────────────────
    ['pre-tool-use', { status: 'mapped', event: 'tool.execute.before' }],
    ['read-guard', { status: 'mapped', event: 'tool.execute.before' }],
    ['prompt-guard', { status: 'mapped', event: 'tool.execute.before' }],
    ['workflow-guard', { status: 'mapped', event: 'tool.execute.before' }],
    // ── tool.execute.after (advisory) ────────────────────────────────
    ['post-tool-use', { status: 'mapped', event: 'tool.execute.after' }],
    ['post-edit', { status: 'mapped', event: 'tool.execute.after' }],
    ['on-large-output', { status: 'mapped', event: 'tool.execute.after' }],
    ['context-monitor', { status: 'mapped', event: 'tool.execute.after' }],
    ['on-error', { status: 'mapped', event: 'tool.execute.after' }],
    ['phase-boundary', { status: 'mapped', event: 'tool.execute.after' }],
    ['notification', { status: 'mapped', event: 'tool.execute.after' }],
    // ── out-of-scope (deferred or no OC equivalent) ──────────────────
    ['session-start', { status: 'out-of-scope' }],
    ['session-end', { status: 'out-of-scope' }],
    ['user-prompt-submit', { status: 'out-of-scope' }],
    ['pre-compact', { status: 'out-of-scope' }],
    ['stop', { status: 'out-of-scope' }],
    ['subagent-stop', { status: 'out-of-scope' }],
    ['post-test-run', { status: 'out-of-scope' }],
    ['pre-commit', { status: 'out-of-scope' }],
    ['pre-push', { status: 'out-of-scope' }],
    ['on-pr-open', { status: 'out-of-scope' }],
  ])
