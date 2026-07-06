/**
 * ANV-0136 — Auto-mode integration for DecisionPrompt.
 *
 * The discipline rule (`decision-template-discipline`) says: when a skill
 * renders a real decision through the canonical template, the agent waits
 * for the user's answer. There are exactly two carve-outs:
 *
 *   1. The user explicitly authorised defaults (`--accept-defaults` flag
 *      or equivalent), OR
 *   2. Auto-mode is active AND the prompt's recommendation is `confidence:
 *      'high'`. In this case the renderer emits the recommendation, the
 *      agent proceeds without waiting, and an audit-trail entry is written
 *      to `.anvil/decisions/<timestamp>.json`.
 *
 * Anywhere else, auto-mode included, the agent waits.
 *
 * This module supplies the small policy primitive `resolveDecisionAutoMode`
 * plus the audit-trail writer. No I/O at module load; the audit writer
 * uses synchronous `fs` (mkdirSync + writeFileSync) so it's safe to call
 * from any layer without an async hop. Layer 0 — no upward imports.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RuntimeContext } from '../runtime/context.js'
import {
  type AskUserQuestionPayload,
  type DecisionPrompt,
  type DecisionSurface,
  renderDecisionPrompt,
} from './decision.js'

/**
 * Runtime auto-mode signal passed to the decision pipeline. `enabled`
 * defaults to `false`; the renderer falls back to "always wait" whenever
 * it's unsure. `acceptDefaults` covers the `--accept-defaults` carve-out.
 * `anvilRoot` (optional) lets the audit writer find `.anvil/decisions/`;
 * when missing, the writer becomes a no-op.
 */
export interface DecisionAutoModeContext {
  enabled?: boolean
  acceptDefaults?: boolean
  anvilRoot?: string
}

/**
 * Outcome of the auto-mode policy decision for a single prompt.
 *
 *   - `'auto-select'` — the agent proceeds without waiting; the renderer
 *     emits the recommendation. Reason: `'accept-defaults'` (user opt-in)
 *     or `'auto-mode-high-confidence'` (eligible carve-out).
 *   - `'wait'`        — the agent waits for the user. Reason carries the
 *     dominant cause (`'auto-mode-off'`, `'no-recommendation'`,
 *     `'low-confidence'`, …).
 */
export type DecisionAutoModeOutcome =
  | {
      action: 'auto-select'
      reason: 'accept-defaults' | 'auto-mode-high-confidence'
      selectedLabel: string
    }
  | {
      action: 'wait'
      reason:
        | 'auto-mode-off'
        | 'no-recommendation'
        | 'low-confidence'
        | 'medium-confidence'
        | 'multiple-recommendations'
    }

/**
 * Resolves the auto-mode policy for a single decision prompt. Pure: only
 * inspects the prompt and the context — no I/O.
 *
 * Branching order matters for auditability:
 *
 *   1. `acceptDefaults` wins outright when a recommendation exists. The
 *      user explicitly delegated decisions; the agent picks the
 *      recommended option regardless of confidence.
 *   2. Auto-mode disabled → wait.
 *   3. No recommended option / multiple recommendations → wait. (Multiple
 *      should not happen — Zod refinement guards against it — but we
 *      keep the branch so future schema relaxations don't silently turn
 *      into auto-selection bugs.)
 *   4. Confidence missing / low / medium → wait. Only `'high'` is
 *      eligible for auto-select.
 *   5. Otherwise → auto-select the recommended option.
 */
export function resolveDecisionAutoMode(
  prompt: DecisionPrompt,
  ctx: DecisionAutoModeContext,
): DecisionAutoModeOutcome {
  const recommended = prompt.options.filter((o) => o.recommended === true)
  if (recommended.length > 1) {
    return { action: 'wait', reason: 'multiple-recommendations' }
  }
  const recommendedOption = recommended[0]

  if (ctx.acceptDefaults === true) {
    if (!recommendedOption) {
      return { action: 'wait', reason: 'no-recommendation' }
    }
    return {
      action: 'auto-select',
      reason: 'accept-defaults',
      selectedLabel: recommendedOption.label,
    }
  }

  if (ctx.enabled !== true) {
    return { action: 'wait', reason: 'auto-mode-off' }
  }
  if (!recommendedOption) {
    return { action: 'wait', reason: 'no-recommendation' }
  }
  if (prompt.confidence === undefined || prompt.confidence === 'low') {
    return { action: 'wait', reason: 'low-confidence' }
  }
  if (prompt.confidence === 'medium') {
    return { action: 'wait', reason: 'medium-confidence' }
  }
  // confidence === 'high'
  return {
    action: 'auto-select',
    reason: 'auto-mode-high-confidence',
    selectedLabel: recommendedOption.label,
  }
}

/**
 * Audit-trail entry written to `.anvil/decisions/<timestamp>.json` when
 * the policy resolves to `auto-select`. Kept JSON-serialisable so the
 * file is greppable and roundtrip-safe.
 */
export interface DecisionAuditEntry {
  /** ISO-8601 timestamp at write time. */
  timestamp: string
  question: string
  selectedLabel: string
  reason: 'accept-defaults' | 'auto-mode-high-confidence'
  confidence?: 'low' | 'medium' | 'high'
  rationale?: string
}

/**
 * Writes an audit-trail entry when the policy auto-selected. Returns the
 * absolute path of the written file, or `undefined` when no write happened
 * (no anvilRoot supplied, write failure, …). Synchronous and side-effecting
 * — callers that want a pure path should compose this with a fake anvilRoot.
 *
 * Filename shape: `<ISO-timestamp-with-colons-replaced>.json` — colons are
 * illegal on Windows and awkward in shell, so we substitute hyphens.
 */
export function writeDecisionAuditEntry(
  prompt: DecisionPrompt,
  outcome: DecisionAutoModeOutcome,
  anvilRoot: string | undefined,
): string | undefined {
  if (outcome.action !== 'auto-select') return undefined
  if (!anvilRoot) return undefined
  const dir = join(anvilRoot, 'decisions')
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  } catch {
    return undefined
  }
  const recommended = prompt.options.find((o) => o.recommended === true)
  const timestamp = new Date().toISOString()
  const entry: DecisionAuditEntry = {
    timestamp,
    question: prompt.question,
    selectedLabel: outcome.selectedLabel,
    reason: outcome.reason,
  }
  if (prompt.confidence !== undefined) entry.confidence = prompt.confidence
  if (recommended?.rationale !== undefined)
    entry.rationale = recommended.rationale
  const filename = `${timestamp.replace(/[:.]/g, '-')}.json`
  const target = join(dir, filename)
  try {
    writeFileSync(target, `${JSON.stringify(entry, null, 2)}\n`, 'utf-8')
  } catch {
    return undefined
  }
  return target
}

// ─── ANV-0176 — RuntimeContext integration ─────────────────────────────────

/**
 * Maps a `RuntimeContext` (autoMode + acceptDefaults) into the
 * `DecisionAutoModeContext` shape that `resolveDecisionAutoMode` consumes.
 * The mapping is intentionally trivial — `autoMode` → `enabled`,
 * `acceptDefaults` → `acceptDefaults` — but keeping the helper a named export
 * makes the wiring auditable from a single import site, and lets callers add
 * an `anvilRoot` for the audit writer without touching the runtime shape.
 */
export function runtimeContextToAutoModeContext(
  runtimeContext: RuntimeContext,
  anvilRoot?: string,
): DecisionAutoModeContext {
  const ctx: DecisionAutoModeContext = {
    enabled: runtimeContext.autoMode,
    acceptDefaults: runtimeContext.acceptDefaults,
  }
  if (anvilRoot !== undefined) ctx.anvilRoot = anvilRoot
  return ctx
}

/**
 * The result of `renderDecisionWithRuntimeContext`. When the policy
 * auto-selects, the caller proceeds with `selectedLabel` and the audit-trail
 * path. Otherwise it emits the surface-rendered payload and waits.
 */
export type DecisionRenderResult =
  | {
      action: 'auto-select'
      reason: 'accept-defaults' | 'auto-mode-high-confidence'
      selectedLabel: string
      /** Absolute path to the audit-trail entry, or undefined when no anvilRoot was supplied. */
      auditPath?: string
    }
  | {
      action: 'wait'
      reason:
        | 'auto-mode-off'
        | 'no-recommendation'
        | 'low-confidence'
        | 'medium-confidence'
        | 'multiple-recommendations'
      /**
       * Surface-rendered payload. For `'claude-code'` this is an
       * `AskUserQuestionPayload`; for `'opencode'` / `'default'` it's a
       * markdown string.
       */
      payload: string | AskUserQuestionPayload
    }

export interface RenderDecisionWithRuntimeContextOptions {
  /** Surface for the renderer when the action is `wait`. */
  surface: DecisionSurface
  /** When supplied, the audit-trail writer creates `<anvilRoot>/decisions/`. */
  anvilRoot?: string
}

/**
 * ANV-0176 — single entry point combining policy resolution, audit-trail
 * writing, and surface rendering. Callers (skill bodies, agents) hand in a
 * `DecisionPrompt` plus the active `RuntimeContext`; the helper returns
 * either an auto-selected outcome (with audit path) or a surface-rendered
 * payload the caller should emit to the user.
 *
 * Invariants:
 *
 *   - `runtimeContext.autoMode === false` and `acceptDefaults === false`
 *     → always `action: 'wait'`.
 *   - `acceptDefaults === true` and the prompt carries a recommendation
 *     → `auto-select`, regardless of confidence.
 *   - `autoMode === true` requires `confidence: 'high'` for auto-select;
 *     low/medium/missing confidence falls through to `wait`.
 *
 * On `auto-select` the audit entry is written eagerly so the trail exists
 * before the caller acts on the decision.
 */
export function renderDecisionWithRuntimeContext(
  prompt: DecisionPrompt,
  runtimeContext: RuntimeContext,
  opts: RenderDecisionWithRuntimeContextOptions,
): DecisionRenderResult {
  const autoModeCtx = runtimeContextToAutoModeContext(
    runtimeContext,
    opts.anvilRoot,
  )
  const outcome = resolveDecisionAutoMode(prompt, autoModeCtx)
  if (outcome.action === 'auto-select') {
    const auditPath = writeDecisionAuditEntry(prompt, outcome, opts.anvilRoot)
    const result: DecisionRenderResult = {
      action: 'auto-select',
      reason: outcome.reason,
      selectedLabel: outcome.selectedLabel,
    }
    if (auditPath !== undefined) result.auditPath = auditPath
    return result
  }
  return {
    action: 'wait',
    reason: outcome.reason,
    payload: renderDecisionPrompt(prompt, opts.surface),
  }
}
