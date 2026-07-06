/**
 * Per-tool truncation budgets — ANV-0023 (OMO §9 refinement).
 *
 * Layer 0 (core). Pure schema + truncation policy; no I/O.
 *
 * The on-large-output compression layer already enforces a token
 * ceiling per tool via `compression.tool_budgets` in ModelsConfig.
 * This module adds a *byte-oriented* policy that complements it: input
 * AND output byte caps per tool, consulted whenever the loader needs
 * to fit a tool result into the surrounding context window.
 *
 * When a tool result would exceed its `output_max_bytes` cap the
 * loader truncates with the markdown-aware truncator and emits a
 * `context-risk-high` observability directive.
 */

import { z } from 'zod'
import { truncateMarkdown } from '../context/markdown-truncate.js'
import {
  type ObservabilityDirective,
  buildDirective,
} from './system-directive.js'

// ─── Schema ─────────────────────────────────────────────────────────────────

export const ToolBudget = z.object({
  /** Max bytes accepted for tool input (request shape). */
  input_max_bytes: z.number().int().positive(),
  /** Max bytes accepted for tool output (result shape). */
  output_max_bytes: z.number().int().positive(),
})
export type ToolBudget = z.infer<typeof ToolBudget>

/**
 * Map of tool name → byte budget. Keys are lower-cased canonical tool
 * names (`bash`, `read`, `edit`, `webfetch`, …); lookup is
 * case-insensitive (`resolveToolBudget`).
 */
export const ToolBudgets = z.record(z.string(), ToolBudget)
export type ToolBudgets = z.infer<typeof ToolBudgets>

// ─── Defaults ───────────────────────────────────────────────────────────────

/**
 * Defaults mirror the OMO §9 reference ranges:
 *   webfetch → 64 KB / 256 KB
 *   bash     → 16 KB / 1 MB
 *   read     → 16 KB / 512 KB
 *   edit     → 16 KB / 256 KB
 *   <any>    → 16 KB / 512 KB
 *
 * "input" caps the prompt-side of the tool call (the user-supplied
 * arguments serialised to JSON); "output" caps the result the tool
 * hands back to the model.
 */
export const DEFAULT_TOOL_BUDGETS: ToolBudgets = {
  webfetch: { input_max_bytes: 64 * 1024, output_max_bytes: 256 * 1024 },
  bash: { input_max_bytes: 16 * 1024, output_max_bytes: 1024 * 1024 },
  read: { input_max_bytes: 16 * 1024, output_max_bytes: 512 * 1024 },
  edit: { input_max_bytes: 16 * 1024, output_max_bytes: 256 * 1024 },
}

/** Fallback when a tool has no explicit budget. */
export const FALLBACK_TOOL_BUDGET: ToolBudget = {
  input_max_bytes: 16 * 1024,
  output_max_bytes: 512 * 1024,
}

/**
 * Resolve the byte budget for `toolName`. Lookup is case-insensitive.
 * Falls back to FALLBACK_TOOL_BUDGET when no entry matches.
 */
export function resolveToolBudget(
  toolName: string,
  budgets: ToolBudgets = DEFAULT_TOOL_BUDGETS,
): ToolBudget {
  const key = toolName.toLowerCase()
  return budgets[key] ?? FALLBACK_TOOL_BUDGET
}

// ─── Truncation policy ──────────────────────────────────────────────────────

export interface ApplyTruncationResult {
  /** Resulting (possibly-truncated) text. */
  text: string
  /** Original byte size before truncation. */
  originalBytes: number
  /** Whether truncation was applied. */
  truncated: boolean
  /** Observability directive when a truncation occurred (else null). */
  directive: ObservabilityDirective | null
}

/**
 * Apply the per-tool budget to a tool result. When the result exceeds
 * the budget the function:
 *   1. Truncates using the markdown-aware truncator (ANV-0019).
 *   2. Builds a `context-risk-high` directive describing the cut.
 *
 * Pure function — no I/O. `now` is injectable for tests.
 */
export function applyToolOutputBudget(
  toolName: string,
  output: string,
  budgets: ToolBudgets = DEFAULT_TOOL_BUDGETS,
  now: Date = new Date(),
): ApplyTruncationResult {
  const budget = resolveToolBudget(toolName, budgets)
  const originalBytes = Buffer.byteLength(output, 'utf-8')
  if (originalBytes <= budget.output_max_bytes) {
    return { text: output, originalBytes, truncated: false, directive: null }
  }
  const cut = truncateMarkdown(output, budget.output_max_bytes)
  // ContextRisk is expressed as a percentage of usage relative to the
  // tool's output ceiling; clamp to [0, 100] for schema compliance.
  const usedPercent = Math.min(
    100,
    Math.round((originalBytes / budget.output_max_bytes) * 100),
  )
  const directive = buildDirective(
    'context-risk-high',
    { usedPercent },
    { severity: 'critical', emittedAt: now.toISOString() },
  )
  return {
    text: cut.text,
    originalBytes,
    truncated: cut.truncated,
    directive,
  }
}
