/**
 * Statusline-bound observability payload — ANV-0023.
 *
 * Layer 0 (core). Pure schema + builders; no I/O.
 *
 * Extends the ANV-0025 `PlanRunStatuslinePayload` shape with an
 * `observability` sub-object carrying typed directives. The ANV-0025
 * payload is `.passthrough()` so this extension is purely additive;
 * existing consumers see the planRun fields they expect plus optional
 * observability data.
 *
 * Wire shape (post-merge):
 *   {
 *     planRun: { … runner fields … },
 *     observability: {
 *       directives: ObservabilityDirective[],
 *       activeProfile?: string,
 *       installedBundle?: string,
 *       currentPhase?: string,
 *     }
 *   }
 */

import { z } from 'zod'
import { ObservabilityDirective } from './system-directive.js'

export const ObservabilityPayload = z
  .object({
    /** Typed observability events emitted this turn. */
    directives: z.array(ObservabilityDirective).default([]),
    /** Active hook profile (minimal | standard | strict), if known. */
    activeProfile: z.string().optional(),
    /** Installed bundle/preset (balanced | cost-optimised | …), if known. */
    installedBundle: z.string().optional(),
    /** Current workflow phase (mirrors AnvilState.phase), if known. */
    currentPhase: z.string().optional(),
  })
  .passthrough()

export type ObservabilityPayload = z.infer<typeof ObservabilityPayload>

/**
 * Pure builder. Returns a payload populated from the supplied
 * directives + optional metadata.
 */
export function buildObservabilityPayload(input: {
  directives?: ObservabilityDirective[]
  activeProfile?: string
  installedBundle?: string
  currentPhase?: string
}): ObservabilityPayload {
  return ObservabilityPayload.parse({
    directives: input.directives ?? [],
    ...(input.activeProfile !== undefined
      ? { activeProfile: input.activeProfile }
      : {}),
    ...(input.installedBundle !== undefined
      ? { installedBundle: input.installedBundle }
      : {}),
    ...(input.currentPhase !== undefined
      ? { currentPhase: input.currentPhase }
      : {}),
  })
}
