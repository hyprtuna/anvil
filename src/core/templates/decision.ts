/**
 * ANV-0136 — Canonical decision-prompt schema + surface renderers.
 *
 * Sister of the ANV-0137 template system. When a skill renders a decision
 * point via `${TEMPLATE:decisions}`, the rendered prose carries the
 * structural skeleton (heading, options layout). The *payload* — the actual
 * question + options + recommendation — comes from `DecisionPrompt`, which
 * skill bodies / agents produce at runtime and the renderer translates into
 * a surface-appropriate primitive:
 *
 *   - claude-code  → `AskUserQuestion` JSON payload consumable by the host
 *   - opencode     → opencode-flavoured markdown
 *   - default      → plain markdown fallback for unknown / non-interactive
 *                    surfaces; the agent shows the prompt and waits inline
 *
 * No I/O. Pure schema + pure renderers. Safe to import from layer-0.
 */

import { z } from 'zod'

// ─── Schema ────────────────────────────────────────────────────────────────

/**
 * A single option presented to the user. `label` is the short identifier
 * (typically `A`, `B`, `C` or a name); `description` is the ≤2-line
 * explanation of what choosing this option means (and what you give up).
 * `recommended` (at most one option may set it to `true`) marks the
 * agent's pick; `rationale` is the one-liner justifying the recommendation
 * when set — surfaces render it alongside the option label.
 */
export const DecisionOption = z
  .object({
    label: z.string().min(1, 'label cannot be empty'),
    description: z.string().min(1, 'description cannot be empty'),
    recommended: z.boolean().optional(),
    rationale: z.string().optional(),
  })
  .strict()

export type DecisionOption = z.infer<typeof DecisionOption>

/**
 * A decision prompt rendered to the user. Carries the question, a one-to-
 * three-sentence explanation of *why* the choice is being put to them, and
 * the option set. At most one option may set `recommended: true`; the
 * Zod refinement below enforces this invariant.
 *
 * `confidence` (optional) lets auto-mode decide whether the recommendation
 * can be auto-selected: only `'high'` is eligible for skip-and-proceed.
 * Omitted when the skill is unsure — the renderer treats absence as
 * "always wait".
 */
export const DecisionPrompt = z
  .object({
    question: z.string().min(1, 'question cannot be empty'),
    explanation: z.string().min(1, 'explanation cannot be empty'),
    options: z
      .array(DecisionOption)
      .min(2, 'a decision must offer at least two options'),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const recommended = value.options.filter((o) => o.recommended === true)
    if (recommended.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `at most one option may be marked recommended (found ${recommended.length})`,
        path: ['options'],
      })
    }
  })

export type DecisionPrompt = z.infer<typeof DecisionPrompt>

// ─── Surface renderers ─────────────────────────────────────────────────────

/**
 * Supported render surfaces. Free-form `string` would be permissive enough
 * to match the rest of the template system, but the renderer dispatch must
 * be exhaustive — unknown surfaces fall through to the markdown default.
 */
export type DecisionSurface = 'claude-code' | 'opencode' | 'default'

/**
 * Renders the prompt for the default / markdown-fallback surface. Used
 * verbatim when no interactive primitive is available.
 *
 * Shape (matches the spec in the ticket): `## Decision: <question>` heading,
 * the explanation as a paragraph, an `Options:` block with one bullet per
 * option, the recommended option suffixed with `(Recommended)`, and a
 * `**Rationale:** …` line when the recommended option carries one.
 */
export function renderDecisionMarkdown(prompt: DecisionPrompt): string {
  const lines: string[] = []
  lines.push(`## Decision: ${prompt.question}`)
  lines.push('')
  lines.push(prompt.explanation.trim())
  lines.push('')
  lines.push('Options:')
  for (const option of prompt.options) {
    const marker = option.recommended ? ' (Recommended)' : ''
    lines.push(`- **${option.label}**${marker} — ${option.description}`)
  }
  const recommended = prompt.options.find((o) => o.recommended === true)
  if (recommended?.rationale) {
    lines.push('')
    lines.push(`**Rationale:** ${recommended.rationale}`)
  }
  return lines.join('\n')
}

/**
 * AskUserQuestion-compatible payload returned by the Claude Code renderer.
 * Shape mirrors the host primitive: a single question with intro text and
 * an `options` array of `{label, description}` records. The renderer marks
 * the recommended option by appending ` (Recommended)` to its label so the
 * host's picker UI shows it without needing a parallel `recommended` field.
 *
 * Carried alongside is `_rationale` (underscore-prefixed so the host's
 * schema validation ignores it) — agents that consume the payload can lift
 * the rationale into a follow-up message after the user picks.
 */
export interface AskUserQuestionPayload {
  question: string
  intro: string
  options: Array<{ label: string; description: string }>
  _rationale?: string
}

/**
 * Renders the prompt as an AskUserQuestion JSON payload for Claude Code.
 * The returned object is JSON-serialisable and can be handed directly to
 * the AskUserQuestion tool by the host agent.
 */
export function renderDecisionClaudeCode(
  prompt: DecisionPrompt,
): AskUserQuestionPayload {
  const options = prompt.options.map((option) => ({
    label: option.recommended ? `${option.label} (Recommended)` : option.label,
    description: option.description,
  }))
  const recommended = prompt.options.find((o) => o.recommended === true)
  const payload: AskUserQuestionPayload = {
    question: prompt.question,
    intro: prompt.explanation.trim(),
    options,
  }
  if (recommended?.rationale) {
    payload._rationale = recommended.rationale
  }
  return payload
}

/**
 * Renders the prompt as opencode-flavoured markdown. Shape mirrors the
 * bundled `templates/decisions/opencode.md` style — block-quoted question,
 * bold option labels, explicit Recommendation/Reason lines for the picked
 * option (when present).
 */
export function renderDecisionOpenCode(prompt: DecisionPrompt): string {
  const lines: string[] = []
  lines.push('**Decision (OpenCode surface):**')
  lines.push('')
  lines.push(`> ${prompt.question}`)
  lines.push('')
  lines.push(prompt.explanation.trim())
  lines.push('')
  lines.push('Options:')
  for (const option of prompt.options) {
    lines.push(`- **${option.label}**: ${option.description}`)
  }
  const recommended = prompt.options.find((o) => o.recommended === true)
  if (recommended) {
    lines.push('')
    lines.push(`**Recommendation:** ${recommended.label}`)
    if (recommended.rationale) {
      lines.push(`**Reason:** ${recommended.rationale}`)
    }
  }
  return lines.join('\n')
}

/**
 * Surface-dispatching renderer. Returns the surface-appropriate payload:
 *
 *   - `'claude-code'` → an `AskUserQuestionPayload` object (JSON-shaped)
 *   - `'opencode'`    → an opencode markdown string
 *   - `'default'`     → a plain markdown string
 *
 * Callers branch on the surface to decide whether to hand the payload to
 * an interactive primitive or splice the string into the rendered body.
 */
export function renderDecisionPrompt(
  prompt: DecisionPrompt,
  surface: DecisionSurface,
): string | AskUserQuestionPayload {
  switch (surface) {
    case 'claude-code':
      return renderDecisionClaudeCode(prompt)
    case 'opencode':
      return renderDecisionOpenCode(prompt)
    case 'default':
      return renderDecisionMarkdown(prompt)
  }
}
