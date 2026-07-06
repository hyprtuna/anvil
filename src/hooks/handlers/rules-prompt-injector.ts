/**
 * rules-prompt-injector handler — Plan 36 Phase E (refactored Plan 43 Phase F).
 *
 * Two registered handlers:
 *  - `rulesPromptInjectorSessionStart`: discovers shipped rule meta-skills and
 *    attaches the list to ctx.context.rules.prompt for downstream consumers.
 *  - `rulesPromptInjectorUserPromptSubmit`: emits a name-only banner naming
 *    the active rules; injects ≤1 KB artifact summaries when a feature is
 *    active; emits soft/hard redirect banners per phase-matrix directives.
 *
 * Both short-circuit when the session is a Task subagent (default-deny).
 *
 * Helpers live under `./rules-prompt-injector/`:
 *   rule-discovery.ts    — loadRuleSkills, RuleSkill (project→user→bundled)
 *   artifact-summary.ts  — buildArtifactSummary (≤1 KB), redirect builders
 *   subagent-guard.ts    — isSubagentContext, emitSubagentStop, UserPromptPayload
 */

import { readState } from '../../core/sdd/state-store.js'
import type { HookHandler, HookResult } from '../../core/types.js'
import { resolvePhaseDirective } from '../../intent/phase-matrix.js'
import { createSystemDirective } from '../system-directive.js'
import {
  buildArtifactSummary,
  buildHardRedirectBlock,
  buildSoftRedirectBanner,
} from './rules-prompt-injector/artifact-summary.js'
import { loadRuleSkills } from './rules-prompt-injector/rule-discovery.js'
import {
  type UserPromptPayload,
  emitSubagentStop,
  isSubagentContext,
  subagentReason,
} from './rules-prompt-injector/subagent-guard.js'

export { loadRuleSkills } from './rules-prompt-injector/rule-discovery.js'

/**
 * onSessionStart: discovers rule meta-skills and attaches metadata to
 * ctx.context.rules.prompt. Short-circuits in subagent context.
 */
export const rulesPromptInjectorSessionStart: HookHandler = async (ctx) => {
  if (isSubagentContext(ctx.payload, ctx.env)) {
    emitSubagentStop(subagentReason(ctx.payload, ctx.env))
    return { exitCode: 0 }
  }

  const rules = await loadRuleSkills(ctx.cwd, ctx.env.HOME)
  const result: HookResult = {
    exitCode: 0,
    context: {
      rules: {
        prompt: rules.map((r) => ({ name: r.name, path: r.path })),
      },
    },
  }
  return result
}

/**
 * onUserPromptSubmit: emits a name-only banner; injects ≤1 KB artifact
 * summaries when the active feature has spec.md/plan.md; layers soft/hard
 * redirect banners on top per the phase matrix. Short-circuits in subagent
 * context.
 */
export const rulesPromptInjectorUserPromptSubmit: HookHandler = async (ctx) => {
  if (isSubagentContext(ctx.payload, ctx.env)) {
    emitSubagentStop(subagentReason(ctx.payload, ctx.env))
    return { exitCode: 0 }
  }

  const rules = await loadRuleSkills(ctx.cwd, ctx.env.HOME)

  let banner: string | undefined
  if (rules.length > 0) {
    const names = rules.map((r) => r.name).join(', ')
    banner = `[rules:prompt] active: ${names}`
  }

  let artifactSummary: string | undefined
  let phaseSystemInsert: string | undefined

  try {
    const state = await readState(ctx.cwd)
    const featureSlug = state.feature_slug

    if (featureSlug) {
      const summary = await buildArtifactSummary(ctx.cwd, featureSlug)
      if (summary) artifactSummary = summary

      const payload = ctx.payload as UserPromptPayload | string | null
      const intentHint =
        typeof payload === 'object' && payload !== null
          ? (payload.intent ?? '')
          : ''
      const effectiveIntent = intentHint || 'implementation'
      const directive = await resolvePhaseDirective(effectiveIntent, ctx.cwd)

      if (directive.kind === 'redirect') {
        if (directive.soft) {
          const redirectBanner = buildSoftRedirectBanner(
            directive.target!,
            directive.reason,
          )
          banner = banner ? `${redirectBanner}\n${banner}` : redirectBanner
        } else {
          phaseSystemInsert = buildHardRedirectBlock(
            directive.target!,
            directive.reason,
          )
        }
      }
    }
  } catch {
    // State read or directive errors: silently degrade — never block on injector errors.
  }

  const systemInsertParts: string[] = []
  if (artifactSummary) systemInsertParts.push(artifactSummary)
  if (phaseSystemInsert) systemInsertParts.push(phaseSystemInsert)

  const rawSystemInsert =
    systemInsertParts.length > 0 ? systemInsertParts.join('\n\n') : undefined
  const systemInsert = rawSystemInsert
    ? createSystemDirective('SKILL_REINFORCEMENT', rawSystemInsert)
    : undefined

  if (!banner && !systemInsert) {
    return { exitCode: 0 }
  }

  return {
    exitCode: 0,
    ...(banner ? { message: banner } : {}),
    ...(systemInsert ? { systemInsert } : {}),
    context: {
      ...(banner ? { rulesPromptBanner: banner } : {}),
      ...(artifactSummary ? { hasArtifactSummary: true } : {}),
    },
  }
}
