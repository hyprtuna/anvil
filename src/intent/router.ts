/**
 * Intent router — the v2 keystone.
 *
 * Input:  a user prompt string + the current project's skill & agent registries.
 * Output: a `RoutingDecision` consumed by every downstream surface
 *         (hook handler, CLI dispatch, slash commands, agent runner).
 *
 * Pipeline:
 *   detectIntents(prompt)
 *     → pickTopIntent(detected)
 *     → buildRoutingDecision(intent, availableSkills, availableAgents)
 *
 * All three steps are independently unit-testable. `route()` is the
 * convenience single-call entry point.
 */

import type {
  ModelsConfig,
  ProjectContext,
  RoutingDecision,
  Skill,
} from '../core/types.js'
import { composeChain } from '../skills/chain.js'
import { computeIntentDeltas } from './context-signals.js'
import {
  INTENT_DEFINITIONS,
  type IntentDefinition,
  type IntentName,
} from './intents.js'
import { resolvePhaseDirective } from './phase-matrix.js'
import { semanticFallback } from './semantic-fallback.js'

export interface DetectedIntent {
  intent: IntentName
  score: number
  matchedKeywords: string[]
}

export interface PickedIntent {
  intent: IntentName
  confidence: number
  fallback?: 'main' | 'ask' | 'generic'
  /**
   * Tie-break candidates when `fallback === 'ask'`. Top two intent names
   * whose scores are within `ASK_TIE_TOLERANCE` of each other; the router
   * defers the choice to the user rather than guess.
   */
  candidates?: IntentName[]
  /**
   * Second-place intent whose score is at least `MULTI_INTENT_THRESHOLD`
   * of the top's. Populated when the router is single-winner confident
   * but evidence suggests a meaningful parallel intent (e.g. "debug then
   * write a regression test"). `fallback === 'ask'` cases do not set
   * `secondary` — they are mutually exclusive.
   */
  secondary?: {
    intent: IntentName
    confidence: number
  }
}

/**
 * Default router thresholds. Each is overridable via
 * `models.json → router.thresholds.*`; the module-level exports are the
 * runtime fallback when no override is present.
 *
 * - `ask_tie_tolerance` — top two scores within this fraction → emit
 *   `fallback: 'ask'` with both candidates.
 * - `multi_intent_threshold` — second-place ≥ this fraction of top →
 *   attach as `secondary`; below, treat as single-intent.
 * - `confidence_floor` — below this, fall back to `generic` agent.
 * - `directive_threshold` — at/above this, promote advisory banner to a
 *   directive (paired with the `orchestrator-first` rule). Does not apply
 *   when `agent === 'main'`.
 */
export interface RouterThresholds {
  ask_tie_tolerance: number
  multi_intent_threshold: number
  confidence_floor: number
  directive_threshold: number
}

export const DEFAULT_ROUTER_THRESHOLDS: RouterThresholds = {
  ask_tie_tolerance: 0.05,
  multi_intent_threshold: 0.6,
  confidence_floor: 0.25,
  directive_threshold: 0.65,
}

/**
 * Resolves router thresholds by merging all override layers in priority order.
 *
 * **Precedence chain (highest → lowest):**
 * 1. CLI flag — caller applies on top after this function returns (e.g.
 *    `anvil route --directive-threshold 0.8`).
 * 2. `ANVIL_DIRECTIVE_THRESHOLD` env var — parsed as a float; clamped to
 *    [0.25, 0.95]. Values outside this range are clamped silently (a warning
 *    is logged for out-of-range inputs before clamping). Non-numeric values
 *    are ignored and the next layer is used.
 * 3. `models.json → router.thresholds` — per-project config file overrides.
 * 4. `DEFAULT_ROUTER_THRESHOLDS` — compile-time defaults (directive_threshold
 *    is 0.65 as of Plan 31 A1).
 *
 * **Note:** This layer is distinct from the Plan 30 session-override layer
 * (`anvil model …`) which targets model selection and does not apply to
 * router thresholds.
 */
export function resolveRouterThresholds(
  config?: ModelsConfig,
): RouterThresholds {
  const override = config?.router?.thresholds ?? {}
  const base: RouterThresholds = {
    ask_tie_tolerance:
      override.ask_tie_tolerance ?? DEFAULT_ROUTER_THRESHOLDS.ask_tie_tolerance,
    multi_intent_threshold:
      override.multi_intent_threshold ??
      DEFAULT_ROUTER_THRESHOLDS.multi_intent_threshold,
    confidence_floor:
      override.confidence_floor ?? DEFAULT_ROUTER_THRESHOLDS.confidence_floor,
    directive_threshold:
      override.directive_threshold ??
      DEFAULT_ROUTER_THRESHOLDS.directive_threshold,
  }

  // Layer 2: ANVIL_DIRECTIVE_THRESHOLD env var overrides directive_threshold.
  const envRaw = process.env.ANVIL_DIRECTIVE_THRESHOLD
  if (envRaw !== undefined && envRaw !== '') {
    const parsed = Number.parseFloat(envRaw)
    if (Number.isNaN(parsed)) {
      process.stderr.write(
        `[anvil] ANVIL_DIRECTIVE_THRESHOLD="${envRaw}" is not a valid float — ignoring\n`,
      )
    } else {
      const ENV_CLAMP_MIN = 0.25
      const ENV_CLAMP_MAX = 0.95
      if (parsed < ENV_CLAMP_MIN || parsed > ENV_CLAMP_MAX) {
        process.stderr.write(
          `[anvil] ANVIL_DIRECTIVE_THRESHOLD=${parsed} is out of [${ENV_CLAMP_MIN}, ${ENV_CLAMP_MAX}] — clamping\n`,
        )
      }
      base.directive_threshold = Math.min(
        ENV_CLAMP_MAX,
        Math.max(ENV_CLAMP_MIN, parsed),
      )
    }
  }

  return base
}

// Backward-compatible module-level constants (unchanged exports). Plan 28
// A6 introduces config overrides via `models.json → router.thresholds`;
// these constants remain as the resolution-chain fallback.
export const ASK_TIE_TOLERANCE = DEFAULT_ROUTER_THRESHOLDS.ask_tie_tolerance
export const MULTI_INTENT_THRESHOLD =
  DEFAULT_ROUTER_THRESHOLDS.multi_intent_threshold
export const CONFIDENCE_FLOOR = DEFAULT_ROUTER_THRESHOLDS.confidence_floor
export const DIRECTIVE_THRESHOLD = DEFAULT_ROUTER_THRESHOLDS.directive_threshold

/**
 * True when a routing decision should render as a directive rather than an
 * advisory banner. A directive fires only when:
 *  - confidence is at or above DIRECTIVE_THRESHOLD, AND
 *  - the chosen agent is a specialist (not the main session fallback), AND
 *  - fallback is not set (fallbacks are always advisory).
 *
 * The hook handler picks `renderRoutingDirective` over `renderRoutingBanner`
 * based on this predicate.
 */
export function isDirective(
  d: RoutingDecision,
  thresholds: RouterThresholds = DEFAULT_ROUTER_THRESHOLDS,
): boolean {
  if (d.fallback) return false
  if (d.agent === 'main') return false
  return d.confidence >= thresholds.directive_threshold
}

/**
 * Detects intents from a prompt via weighted keyword matching.
 *
 * Positive patterns add their weight to the intent's score. Negative
 * patterns subtract their weight — an intent whose net score is ≤ 0 after
 * applying negatives is vetoed (removed from results entirely).
 *
 * Returns scoring info sorted high-to-low. Only intents with score > 0.
 */
export function detectIntents(prompt: string): DetectedIntent[] {
  const lower = prompt.toLowerCase()
  const results: DetectedIntent[] = []

  for (const def of Object.values(INTENT_DEFINITIONS)) {
    let score = 0
    const matched: string[] = []
    for (const { keyword, weight } of def.patterns) {
      const re =
        typeof keyword === 'string' ? new RegExp(`\\b${keyword}\\b`) : keyword
      if (re.test(lower)) {
        score += weight
        matched.push(
          typeof keyword === 'string'
            ? keyword
            : keyword.source.replace(/\\b/g, ''),
        )
      }
    }
    for (const { keyword, weight } of def.negativePatterns ?? []) {
      const re =
        typeof keyword === 'string' ? new RegExp(`\\b${keyword}\\b`) : keyword
      if (re.test(lower)) {
        score -= weight
      }
    }
    if (score > 0) {
      results.push({ intent: def.name, score, matchedKeywords: matched })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

/**
 * Picks the top intent from a detected list and computes a normalized
 * confidence.
 *
 * Decision order:
 *   1. Empty list → `fallback: 'main'` (router has no signal; let main
 *      handle it).
 *   2. Confidence below `CONFIDENCE_FLOOR` → `fallback: 'generic'`.
 *   3. Top and runner-up within `ASK_TIE_TOLERANCE` → `fallback: 'ask'`
 *      with both named in `candidates` (router cannot tell them apart).
 *   4. Runner-up ≥ `MULTI_INTENT_THRESHOLD` of top → single primary with
 *      `secondary` attached (parallel-mode candidate).
 *   5. Otherwise → single primary, no secondary.
 */
export function pickTopIntent(
  detected: DetectedIntent[],
  thresholds: RouterThresholds = DEFAULT_ROUTER_THRESHOLDS,
): PickedIntent {
  if (detected.length === 0) {
    return { intent: 'autonomous', confidence: 0, fallback: 'main' }
  }
  const total = detected.reduce((sum, d) => sum + d.score, 0)
  const top = detected[0]
  // Plan 31 A5: reweight confidence to boost strong-primary + weak-secondary
  // while keeping flat multi-intent distributions low.
  const secondary = detected[1]
  const numerator = top.score + 0.3 * (secondary?.score ?? 0)
  const denominator =
    top.score +
    (secondary?.score ?? 0) +
    Math.max(0, total - top.score - (secondary?.score ?? 0))
  const confidence = denominator === 0 ? 0 : numerator / denominator
  if (confidence < thresholds.confidence_floor) {
    return { intent: top.intent, confidence, fallback: 'generic' }
  }
  const second = detected[1]
  if (second) {
    const gap = (top.score - second.score) / top.score
    if (gap <= thresholds.ask_tie_tolerance) {
      return {
        intent: top.intent,
        confidence,
        fallback: 'ask',
        candidates: [top.intent, second.intent],
      }
    }
    if (second.score / top.score >= thresholds.multi_intent_threshold) {
      return {
        intent: top.intent,
        confidence,
        secondary: {
          intent: second.intent,
          confidence: second.score / total,
        },
      }
    }
  }
  return { intent: top.intent, confidence }
}

/**
 * Assembles a `RoutingDecision` from a picked intent. Filters the intent's
 * default skill bundle against what's actually registered, and resolves the
 * default agent likewise.
 *
 * `availableSkills` / `availableAgents` are name sets so the router stays
 * out of the Skill / Agent schema layer.
 */
/**
 * An empty set signals "registry unknown at this stage — keep defaults as-is."
 * Callers with a live registry pass the real name set so defaults get filtered.
 *
 * `skillObjects` is optional — when provided, the chain preview is resolved
 * for the top skill via `composeChain`. When absent, `chainPreview` is `[]`.
 */
export function buildRoutingDecision(
  picked: PickedIntent,
  availableSkills: ReadonlySet<string>,
  availableAgents: ReadonlySet<string>,
  skillObjects?: readonly Skill[],
): RoutingDecision {
  const def: IntentDefinition = INTENT_DEFINITIONS[picked.intent]
  const skills =
    availableSkills.size === 0
      ? [...def.defaultSkills]
      : def.defaultSkills.filter((s) => availableSkills.has(s))
  const agent =
    availableAgents.size === 0 || availableAgents.has(def.defaultAgent)
      ? def.defaultAgent
      : picked.fallback === 'main'
        ? 'main'
        : def.defaultAgent

  let secondaryIntents: RoutingDecision['secondaryIntents'] = []
  if (picked.secondary) {
    const secDef = INTENT_DEFINITIONS[picked.secondary.intent]
    const secSkills =
      availableSkills.size === 0
        ? [...secDef.defaultSkills]
        : secDef.defaultSkills.filter((s) => availableSkills.has(s))
    const secAgent =
      availableAgents.size === 0 || availableAgents.has(secDef.defaultAgent)
        ? secDef.defaultAgent
        : secDef.defaultAgent
    secondaryIntents = [
      {
        intent: picked.secondary.intent,
        agent: secAgent,
        skills: secSkills,
        confidence: picked.secondary.confidence,
      },
    ]
  }

  const mode: RoutingDecision['mode'] =
    secondaryIntents.length > 0 ? 'parallel' : 'single'

  // Compose chain preview for the top skill when skill objects are available.
  let chainPreview: string[] = []
  if (skillObjects && skillObjects.length > 0 && skills.length > 0) {
    const topSkillName = skills[0]
    try {
      chainPreview = composeChain(topSkillName, [...skillObjects])
      // Only expose the preview when there actually is a multi-step chain.
      if (chainPreview.length <= 1) chainPreview = []
    } catch {
      // ChainCycleDetected / ChainDepthExceeded — silently degrade.
      chainPreview = []
    }
  }

  return {
    intent: picked.intent,
    confidence: picked.confidence,
    agent,
    mode,
    skills,
    rules: {
      prompt: def.applicableRules,
      execution: def.executionRules ?? [],
      safety: def.safetyRules ?? [],
      workflow: def.workflowRules ?? [],
    },
    secondaryIntents,
    candidates: picked.candidates ?? [],
    chainPreview,
    ...(picked.fallback ? { fallback: picked.fallback } : {}),
  }
}

export interface RouteRegistry {
  availableSkills: ReadonlySet<string>
  availableAgents: ReadonlySet<string>
  /**
   * Full skill objects — when supplied, `buildRoutingDecision` uses them
   * to compose the chain preview via `composeChain`. Optional; when absent,
   * `chainPreview` is always `[]`.
   */
  skillObjects?: readonly Skill[]
}

/**
 * Applies context-signal deltas to a detected-intents list. Adds new
 * intents that did not match any keyword when the delta is positive.
 * Re-sorts high-to-low after applying. When `ctx` is undefined or no
 * deltas apply, returns the input unchanged.
 */
export function applyContextSignals(
  prompt: string,
  detected: DetectedIntent[],
  ctx: ProjectContext | undefined,
): DetectedIntent[] {
  if (!ctx) return detected
  const deltas = computeIntentDeltas(prompt, ctx)
  if (Object.keys(deltas).length === 0) return detected
  const byIntent = new Map<IntentName, DetectedIntent>()
  for (const d of detected) byIntent.set(d.intent, { ...d })
  for (const [intent, n] of Object.entries(deltas) as [IntentName, number][]) {
    const existing = byIntent.get(intent)
    if (existing) {
      existing.score += n
    } else if (n > 0) {
      byIntent.set(intent, { intent, score: n, matchedKeywords: [] })
    }
  }
  return [...byIntent.values()]
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
}

/**
 * Single-call entry point. Runs the whole pipeline:
 *   prompt → detectIntents → applyContextSignals(ctx) → pickTopIntent
 *          → buildRoutingDecision
 *
 * `ctx` is optional — when supplied, it boosts intents whose keyword
 * patterns overlap with the project's language mix, frameworks, test
 * runners, and CI. When absent (the default on the hot hook path), the
 * router stays prompt-only.
 */
/**
 * Threshold below which the keyword-based confidence is considered "too weak"
 * to trust — below this value the semantic fallback is attempted.
 *
 * Deliberately lower than `CONFIDENCE_FLOOR` (0.25) so the fallback only
 * fires when the keyword pass is genuinely blind (no useful signal). The
 * `fallback: 'main'` path (zero detections) is always eligible.
 */
export const SEMANTIC_FALLBACK_TRIGGER_THRESHOLD = 0.2

export function route(
  prompt: string,
  registry: RouteRegistry,
  ctx?: ProjectContext,
  thresholds: RouterThresholds = DEFAULT_ROUTER_THRESHOLDS,
): RoutingDecision {
  const detected = detectIntents(prompt)
  const boosted = applyContextSignals(prompt, detected, ctx)
  const picked = pickTopIntent(boosted, thresholds)
  const primary = buildRoutingDecision(
    picked,
    registry.availableSkills,
    registry.availableAgents,
    registry.skillObjects,
  )

  // ── Semantic fallback (Plan 31 G3) ──────────────────────────────────────
  // If keyword routing has no signal (fallback === 'main') or very low
  // confidence, try a Jaccard-based secondary pass against skill descriptions.
  // The fallback is only attempted when full skill objects are available.
  const shouldTryFallback =
    registry.skillObjects &&
    registry.skillObjects.length > 0 &&
    (primary.fallback === 'main' ||
      primary.confidence < SEMANTIC_FALLBACK_TRIGGER_THRESHOLD)

  if (shouldTryFallback && registry.skillObjects) {
    const fb = semanticFallback(prompt, [...registry.skillObjects])
    if (fb !== null) {
      process.stderr.write(
        `[anvil:semantic-fallback] fired — skill="${fb.skill}" confidence=${fb.confidence.toFixed(2)}\n`,
      )
      // Find the intent that owns this skill (for rules/agent lookup).
      // Fall back to 'autonomous' intent if the skill is unrecognised.
      const owningIntentEntry = Object.values(INTENT_DEFINITIONS).find((def) =>
        def.defaultSkills.includes(fb.skill),
      )
      const intendName: IntentName = owningIntentEntry?.name ?? 'autonomous'
      const fbPicked: PickedIntent = {
        intent: intendName,
        confidence: fb.confidence,
        fallback: 'generic',
      }
      const fbDecision = buildRoutingDecision(
        fbPicked,
        registry.availableSkills,
        registry.availableAgents,
        registry.skillObjects,
      )
      // Override skills to include the specific skill the fallback identified.
      return {
        ...fbDecision,
        skills: registry.availableSkills.has(fb.skill)
          ? [fb.skill]
          : fbDecision.skills,
      }
    }
  }

  return primary
}

/**
 * Phase-aware route entry point (Plan 36 Phase E).
 *
 * Runs the full keyword→semantic pipeline like `route()`, then consults
 * the phase-resolution matrix to attach a `Directive` to the decision.
 *
 * The directive is derived from:
 *   - `state-store.readState(cwd)` → `feature_slug`, `phase`
 *   - Artifact presence at `.anvil/specs/features/<slug>/`
 *   - The 7-intent × 4-artifact-state matrix
 *
 * Non-implementation intents always get `{ kind: 'proceed' }` — the SDD
 * pipeline only gates the `implementation` intent path.
 *
 * Returns a `RoutingDecision` with the `directive` field populated.
 * Falls back to `route()` result (no directive) on any state-store error.
 */
export async function routeWithDirective(
  prompt: string,
  registry: RouteRegistry,
  cwd: string,
  ctx?: ProjectContext,
  thresholds: RouterThresholds = DEFAULT_ROUTER_THRESHOLDS,
): Promise<RoutingDecision> {
  const decision = route(prompt, registry, ctx, thresholds)

  try {
    const directive = await resolvePhaseDirective(decision.intent, cwd)
    return { ...decision, directive }
  } catch {
    // State-store read errors: return decision without directive (no block)
    return decision
  }
}
