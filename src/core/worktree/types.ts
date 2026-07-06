import { z } from 'zod'

// ---------------------------------------------------------------------------
// ANV-0155 — Worktree command types
// Layer 0 — pure Zod schemas, no I/O
// ---------------------------------------------------------------------------

/** ANV-NNNN ticket identifier (strict format). */
export const TicketId = z
  .string()
  .regex(/^ANV-\d{4}$/, 'TicketId must match ANV-NNNN')
export type TicketId = z.infer<typeof TicketId>

/** URL-safe lowercase slug derived from a ticket header. Max 50 chars. */
export const Slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Invalid slug format')
  .max(50)
export type Slug = z.infer<typeof Slug>

/** Result of `anvil worktree create`. */
export const WorktreeCreateResult = z.object({
  branch: z.string(),
  worktree: z.string(),
  base: z.string(),
  ticket: z.string(),
  spec_excerpt: z.string(),
  verification_commands: z.array(z.string()),
})
export type WorktreeCreateResult = z.infer<typeof WorktreeCreateResult>

/** Classification of a worktree entry during cleanup. */
export const CleanupAction = z.enum([
  'remove',
  'skip-dirty',
  'skip-unmerged',
  'skip-unpushed',
  'skip-primary',
  'skip-protected',
])
export type CleanupAction = z.infer<typeof CleanupAction>

/** One entry in the cleanup plan. */
export const CleanupItem = z.object({
  path: z.string(),
  branch: z.string().optional(),
  action: CleanupAction,
  reason: z.string(),
})
export type CleanupItem = z.infer<typeof CleanupItem>

/** Result of `anvil worktree cleanup`. */
export const WorktreeCleanupResult = z.object({
  items: z.array(CleanupItem),
  removed: z.number(),
  skipped: z.number(),
  dryRun: z.boolean(),
})
export type WorktreeCleanupResult = z.infer<typeof WorktreeCleanupResult>

/** Parsed worktree entry from `git worktree list --porcelain`. */
export interface WorktreeEntry {
  path: string
  branch: string | undefined
  head: string | undefined
  bare: boolean
}
