/**
 * OpenCode plugin manifest schema + hook-event mapping.
 *
 * Plan 28 Phase B1: Anvil's `HookKind` enum is platform-neutral; each
 * adapter maps the kinds it can wire to its target's lifecycle event.
 * The Claude Code adapter has `HOOK_KIND_TO_EVENT`; until v0.4 the
 * OpenCode adapter had nothing — hooks were copied to disk but never
 * registered with OpenCode's plugin loader.
 *
 * OpenCode's plugin surface (per `src/opencode-plugin/index.ts`) exposes
 * a `config()` lifecycle plus `experimental.chat.messages.transform()`.
 * Anvil maps the small set of hook kinds that have a sensible OpenCode
 * equivalent; the remainder are explicitly listed as `unmapped` so tests
 * (and `anvil doctor`) can surface that drift instead of silently
 * dropping them.
 */

import { z } from 'zod'
import { OC_HOOK_REGISTRY, type OcLifecycleEvent } from './oc-hook-registry.js'

/**
 * OpenCode plugin lifecycle event surface. ANV-0040: this enum now
 * includes both the loader-level events (`config`,
 * `chat.messages.transform`) reserved for future wiring AND the
 * tool-call lifecycle events (`tool.execute.before`,
 * `tool.execute.after`) that the compiled plugin actually fires
 * today. See `oc-hook-registry.ts` for the full source-of-truth
 * mapping; the manifest is now truthful about which events Anvil
 * dispatches into.
 */
export const OpencodeHookEvent = z.enum([
  'config',
  'chat.messages.transform',
  'tool.execute.before',
  'tool.execute.after',
])
export type OpencodeHookEventT = z.infer<typeof OpencodeHookEvent>

// ANV-0040 sanity: the registry's lifecycle-event vocabulary must
// remain a subset of the manifest's enum. Compile-time guard.
const _registryEventsAreManifestEvents: OpencodeHookEventT extends OcLifecycleEvent
  ? OcLifecycleEvent extends OpencodeHookEventT
    ? true
    : never
  : never = true
void _registryEventsAreManifestEvents

/**
 * Mapping from Anvil's internal `HookKind` strings to the OpenCode
 * event the adapter wires them to. Derived from `OC_HOOK_REGISTRY` —
 * the runtime in `src/opencode-plugin/hooks/map.ts` and this manifest
 * registry are guaranteed to agree (contract test:
 * `tests/unit/core/manifest-schema/oc-hook-registry-contract.test.ts`).
 *
 * Kinds NOT present here are listed in `UNMAPPED_OC_HOOKS`.
 */
export const HOOK_KIND_TO_OC_EVENT: Record<string, OpencodeHookEventT> =
  (() => {
    const out: Record<string, OpencodeHookEventT> = {}
    for (const [kind, disposition] of OC_HOOK_REGISTRY) {
      if (disposition.status === 'mapped') out[kind] = disposition.event
    }
    return out
  })()

/**
 * Anvil hook kinds that have NO OpenCode equivalent today. The
 * OpenCode adapter generates the file artifact (in case OpenCode adds
 * support later) but does not register the hook with the plugin
 * loader. Doctor surfaces this list so users with OpenCode targets
 * are not surprised. Derived from `OC_HOOK_REGISTRY`.
 */
export const UNMAPPED_OC_HOOKS = new Set<string>(
  [...OC_HOOK_REGISTRY.entries()]
    .filter(([, d]) => d.status === 'out-of-scope')
    .map(([kind]) => kind),
)

/**
 * Resolve an Anvil hook kind to one of: `{event}` (mapped), `unmapped`
 * (known kind without OC support), or `unknown` (not registered with
 * either side — likely a typo or an internal-only kind).
 */
export function resolveOcHook(
  kind: string,
):
  | { status: 'mapped'; event: OpencodeHookEventT }
  | { status: 'unmapped' }
  | { status: 'unknown' } {
  if (kind in HOOK_KIND_TO_OC_EVENT) {
    return { status: 'mapped', event: HOOK_KIND_TO_OC_EVENT[kind] }
  }
  if (UNMAPPED_OC_HOOKS.has(kind)) return { status: 'unmapped' }
  return { status: 'unknown' }
}

/**
 * OpenCode `package.json` keys Anvil cares about. This is a structural
 * subset of npm's package.json — Anvil only writes/reads the fields
 * documented here; OpenCode itself may have additional fields it
 * consumes that pass through the JSON unchanged.
 */
export const OpencodePluginManifest = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'semver required'),
  description: z.string().optional(),
  type: z.literal('module').optional(),
  main: z.string().optional(),
  /**
   * Anvil-specific block describing which hook events this plugin
   * registers. Optional — OpenCode itself ignores it. Anvil's `doctor`
   * reads it back to verify the wiring matches the live registry.
   */
  anvil: z
    .object({
      hooks: z
        .object({
          mapped: z.array(
            z.object({
              kind: z.string(),
              event: OpencodeHookEvent,
            }),
          ),
          unmapped: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
})

export type OpencodePluginManifestT = z.infer<typeof OpencodePluginManifest>
