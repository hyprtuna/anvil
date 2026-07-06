import { z } from 'zod'

// ─── Notepads section enum ─────────────────────────────────────────────
// Source of truth — SkillFrontmatter.notepads_section and
// AgentFrontmatter.notepads_section in src/core/types.ts must mirror this list.
// 'large-outputs' added in Plan 32 C6 for on-large-output stash files.
export const NotepadsSection = z.enum([
  'learnings',
  'decisions',
  'issues',
  'verification',
  'problems',
  'large-outputs',
])
export type NotepadsSection = z.infer<typeof NotepadsSection>

// ─── Single notepad entry ──────────────────────────────────────────────
export const NotepadsEntry = z.object({
  /** Which section this entry belongs to. */
  section: NotepadsSection,
  /** Short headline (≤80 chars). */
  headline: z.string().min(1).max(80),
  /** Optional extended body. */
  body: z.string().optional(),
  /** Skill or agent name that wrote this entry. */
  source: z.string().min(1),
  /** ISO-8601 timestamp. */
  timestamp: z.string().datetime(),
})
export type NotepadsEntry = z.infer<typeof NotepadsEntry>

// ─── Notepads config (also embedded in AnvilConfig / anvil.json) ───────
export const NotepadsConfig = z.object({
  /**
   * Token budget profile for auto-loading recent-context.md at SessionStart.
   *   minimal  → ≤200 tokens (top ~6 entries)
   *   standard → ≤500 tokens (top 12-15 entries)  [default]
   *   strict   → ≤1000 tokens (full recent-context)
   */
  profile: z.enum(['minimal', 'standard', 'strict']).default('standard'),
  /**
   * Override the derived per-section char limit.
   * Normally derived from the profile; set only to override.
   */
  maxTokensPerSection: z.number().int().positive().optional(),
})
export type NotepadsConfig = z.infer<typeof NotepadsConfig>

// ─── Token budget by profile ───────────────────────────────────────────
export const TOKEN_BUDGET: Record<NotepadsConfig['profile'], number> = {
  minimal: 200,
  standard: 500,
  strict: 1000,
}
