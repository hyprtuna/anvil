/**
 * UserPromptSubmit handler — refactored Plan 43 Phase H.
 *
 * Validates the prompt, routes through the intent router, attaches the
 * RoutingDecision to context, emits the routing banner, and persists active
 * state for downstream consumers (statusline, OpenCode transform()).
 *
 * Helpers live under `./user-prompt-submit/`:
 *   loaders.ts       — readRegistry, readProjectContext
 *   active-state.ts  — writeActiveSkill, writeActiveRouting (atomic)
 *   payload.ts       — extractPrompt
 *
 * Never blocks (exitCode 2 is never returned from this handler).
 */

import {
  renderRoutingBanner,
  renderRoutingDirective,
} from '../../core/routing-banner.js'
import type { HookHandler } from '../../core/types.js'
import {
  isDirective,
  resolveRouterThresholds,
  route,
} from '../../intent/router.js'
import { createSystemDirective } from '../system-directive.js'
import {
  extractTranscriptPath,
  writeActiveRouting,
  writeActiveSkill,
} from './user-prompt-submit/active-state.js'
import {
  readProjectContext,
  readRegistry,
} from './user-prompt-submit/loaders.js'
import { extractPrompt } from './user-prompt-submit/payload.js'

/**
 * Routing banner is emitted via `message` (terminal stdout).
 * Suppress with ANVIL_ROUTING_BANNER=off|0|false (default: on).
 *
 * For high-confidence directives, `systemInsert` is set so the adapter
 * injects the directive into model context (CC additionalContext / OC
 * transform() prepend) and `.anvil/active-routing.json` is written for
 * cross-turn pickup.
 */
export const userPromptSubmitHandler: HookHandler = async (ctx) => {
  const prompt = extractPrompt(ctx.payload)
  if (!prompt || prompt.trim().length === 0) {
    return { exitCode: 1, message: 'empty prompt detected' }
  }

  const thresholds = resolveRouterThresholds(ctx.config)

  const [registry, projectCtx] = await Promise.all([
    readRegistry(ctx.cwd),
    readProjectContext(ctx.cwd),
  ])

  const routingDecision = route(
    prompt,
    {
      availableSkills: new Set(registry?.skills ?? []),
      availableAgents: new Set(registry?.agents ?? []),
    },
    projectCtx,
    thresholds,
  )

  const bannerEnv = ctx.env.ANVIL_ROUTING_BANNER
  const bannerSuppressed =
    bannerEnv === 'off' || bannerEnv === '0' || bannerEnv === 'false'
  const directive = isDirective(routingDecision, thresholds)
  const banner = bannerSuppressed
    ? ''
    : directive
      ? renderRoutingDirective(routingDecision)
      : renderRoutingBanner(routingDecision)

  const transcriptPath = extractTranscriptPath(ctx.payload)

  await writeActiveSkill(ctx.cwd, routingDecision, transcriptPath)

  const rawDirective = directive
    ? renderRoutingDirective(routingDecision)
    : undefined
  const systemInsert = rawDirective
    ? createSystemDirective('ROUTING_HINT', rawDirective)
    : undefined
  if (directive && systemInsert) {
    // Write the typed directive to active-routing.json so downstream consumers
    // (OpenCode transform(), status-line) receive the same value the model sees.
    await writeActiveRouting(ctx.cwd, systemInsert, prompt, transcriptPath)
  }

  return {
    exitCode: 0,
    ...(banner ? { message: banner } : {}),
    ...(systemInsert !== undefined ? { systemInsert } : {}),
    context: {
      promptLength: prompt.length,
      routingDecision,
    },
  }
}
