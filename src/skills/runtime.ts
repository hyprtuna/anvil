import { resolveModel } from '../core/models/resolve.js'
import type { ResolveOptions } from '../core/models/resolve.js'
import { isRetryableSDKError } from '../core/models/retry.js'
import type { SkillRegistry } from '../core/registry/skill-registry.js'
import type { ModelsConfig, ProjectContext, Skill } from '../core/types.js'

export interface SkillInvocation {
  skill: Skill
  prompt: string
  model: string
  /**
   * Effort level for the model API call. `undefined` when the resolved model
   * does not accept an effort parameter (e.g., Haiku). Callers should omit
   * the effort field from the API call when this is `undefined`.
   * Plan 38 Phase A: optional after `clampEffortForModel` was introduced.
   */
  effort: string | undefined
  max_tokens: number
  source: string
  /**
   * Cascade of fallback model IDs to try on transient SDK failures
   * (model_not_available / rate_limit_exceeded). Aliases are already resolved
   * to concrete model IDs. Empty array = no fallback behaviour.
   *
   * Plan 33 D: `runSkillInvocation` walks this chain on retryable SDK errors.
   * Cap: 2 retries = 3 total attempts (primary + 2 fallbacks).
   * After cap, the original error surfaces (not the last attempt's error).
   */
  fallback_chain: string[]
}

/**
 * Prepares a skill invocation — resolves model/effort and assembles context.
 * Does NOT call the model (that's the CLI/agent layer's job).
 */
export function prepareSkillInvocation(
  skillName: string,
  userPrompt: string,
  registry: SkillRegistry,
  config: ModelsConfig,
  _context: ProjectContext,
  resolveOpts: ResolveOptions = {},
): SkillInvocation | undefined {
  const skill = registry.get(skillName)
  if (!skill) return undefined

  const resolution = resolveModel(skillName, config, resolveOpts)

  return {
    skill,
    prompt: userPrompt,
    model: resolution.model,
    effort: resolution.effort,
    max_tokens: resolution.max_tokens,
    source: resolution.source,
    fallback_chain: resolution.fallback_chain,
  }
}

// ─── Sub-skill runtime context (Plan 33 A3) ─────────────────────────────

/**
 * Execution context passed to `runSkill`. Callers may provide `subSkillOutputs`
 * from a prior invocation; the function appends to it when executing sub-skills.
 */
export interface SkillRunContext {
  /** User prompt / parent invocation input. */
  prompt: string
  /**
   * Accumulated outputs from child skills (populated by runSkill when
   * sub_skills are declared). Exposed to the parent body as a
   * `<sub-skill-outputs>` block in the conversation context.
   */
  subSkillOutputs: string[]
  /** Resolved ModelsConfig for model resolution of child skills. */
  config: ModelsConfig
  /** Project context forwarded to each child skill. */
  projectContext: ProjectContext
}

/**
 * Result from running a skill (or a sub-skill recursively).
 */
export interface SkillRunResult {
  /**
   * Ordered invocations to execute: sub-skill invocations first (in declared
   * order), parent invocation last. The caller (CLI/agent layer) executes
   * these in sequence, passing each prior output into the next.
   *
   * This is the "plan" pattern: `runSkill` builds the execution plan;
   * the executor layer carries it out, preserving the existing SDK boundary.
   */
  invocations: SkillInvocation[]
  /**
   * `<sub-skill-outputs>` block that the parent's body should receive in
   * its conversation context. Empty string when no sub-skills are declared.
   * The caller is responsible for injecting this into the model's context
   * before running the parent invocation.
   */
  subSkillContextBlock: string
}

/**
 * Builds an ordered execution plan for a skill and its sub-skills (Plan 33 A3).
 *
 * When `skill.frontmatter.sub_skills` is non-empty, each child is resolved
 * from the registry and scheduled before the parent. Each child's own
 * model/effort/max_tokens resolution uses the existing 5-layer chain.
 *
 * Returns an ordered list of `SkillInvocation` objects. The caller executes
 * them in sequence; this function does not call the model.
 *
 * Children missing from the registry are silently skipped (they will have
 * already been recorded as defects during load — see Plan 33 A1.b).
 *
 * Sub-skills that themselves declare `sub_skills` are NOT recursively
 * expanded by this function — deep nesting is deferred to v0.9. Only the
 * immediate children declared on the invoked skill are scheduled.
 */
export function runSkill(
  skill: Skill,
  ctx: SkillRunContext,
  registry: SkillRegistry,
  resolveOpts: ResolveOptions = {},
): SkillRunResult {
  const invocations: SkillInvocation[] = []
  const childNames = skill.frontmatter.sub_skills ?? []

  // Schedule each child in declared order
  for (const childName of childNames) {
    const childSkill = registry.get(childName)
    if (!childSkill) {
      // Missing child — skip (defect was recorded at load time)
      continue
    }
    const childResolution = resolveModel(childName, ctx.config, resolveOpts)
    invocations.push({
      skill: childSkill,
      prompt: ctx.prompt,
      model: childResolution.model,
      effort: childResolution.effort,
      max_tokens: childResolution.max_tokens,
      source: childResolution.source,
      fallback_chain: childResolution.fallback_chain,
    })
  }

  // Parent runs last
  const parentResolution = resolveModel(
    skill.frontmatter.name,
    ctx.config,
    resolveOpts,
  )
  invocations.push({
    skill,
    prompt: ctx.prompt,
    model: parentResolution.model,
    effort: parentResolution.effort,
    max_tokens: parentResolution.max_tokens,
    source: parentResolution.source,
    fallback_chain: parentResolution.fallback_chain,
  })

  // Build the <sub-skill-outputs> context block (to be injected before parent runs)
  const subSkillContextBlock =
    ctx.subSkillOutputs.length > 0
      ? `<sub-skill-outputs>\n${ctx.subSkillOutputs.join('\n\n')}\n</sub-skill-outputs>`
      : ''

  return { invocations, subSkillContextBlock }
}

/**
 * Caller-supplied executor for a skill invocation. Mirrors the agent runner's
 * `InvocationExecutor` pattern — injectable for tests and alternate runtimes.
 */
export type SkillExecutor = (invocation: SkillInvocation) => Promise<string>

/**
 * Runs a skill invocation end-to-end: dispatches via the provided executor,
 * walks `fallback_chain` on retryable SDK errors, and returns the raw output.
 *
 * Retry semantics (Plan 33 D4):
 *   - Retryable errors: model_not_available / rate_limit_exceeded.
 *   - Cap: 2 retries = 3 total attempts (primary + 2 fallbacks).
 *   - Original error surfaces after cap (not the last retry's error).
 *   - Empty chain: no retry — error surfaces immediately.
 */
/**
 * Retry budget for the proactive `fallback_chain` consumer.
 * Plan 44 Phase F — exported so the reactive `runtime-fallback` hook
 * (src/hooks/handlers/runtime-fallback.ts) can share a single source of truth.
 * Cap: 2 retries = 3 total attempts (primary + 2 fallbacks).
 */
export const RUNTIME_FALLBACK_MAX_RETRIES = 2

export async function runSkillInvocation(
  invocation: SkillInvocation,
  executor: SkillExecutor,
): Promise<string> {
  const MAX_RETRIES = RUNTIME_FALLBACK_MAX_RETRIES
  const chain = invocation.fallback_chain
  let originalError: unknown
  let result: string | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // On retry attempts, substitute the next chain entry as the model.
    const currentInvocation: SkillInvocation =
      attempt === 0
        ? invocation
        : {
            ...invocation,
            model: chain[attempt - 1],
            source: 'default', // fallback — source is informational
          }

    try {
      result = await executor(currentInvocation)
      break // success — exit the loop
    } catch (err) {
      if (attempt === 0) {
        originalError = err
      }

      const isRetryable = isRetryableSDKError(err)
      const hasChainEntry = attempt < chain.length
      const canRetry = isRetryable && hasChainEntry && attempt < MAX_RETRIES

      if (!canRetry) {
        // Surface original error (not err, which may be from a later retry).
        throw originalError
      }
      // else: continue to next attempt
    }
  }

  // result is always set here — loop only exits via break (success) or throw
  // TypeScript cannot infer the loop invariant, so we default to empty string
  // (unreachable: the loop always either assigns result or throws)
  return result ?? ''
}
