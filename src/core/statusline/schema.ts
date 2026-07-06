/**
 * StatuslineInput — full Claude Code statusline JSON shape.
 *
 * Source: `references/claude-docs/settings/statusline.md` (lines 149–251).
 * The schema is captured verbatim — every field documented in the CC docs
 * has a corresponding entry here. Optional fields are marked optional;
 * conditional fields (`rate_limits` is Pro/Max-only, `worktree` only
 * during `--worktree` sessions, etc.) are documented inline.
 *
 * Plan 28 Phase C1.
 */

import { z } from 'zod'

const ModelInfo = z.object({
  id: z.string(),
  display_name: z.string(),
})

const Workspace = z.object({
  current_dir: z.string(),
  project_dir: z.string().optional(),
  added_dirs: z.array(z.string()).optional(),
  /** Present only inside a linked git worktree. */
  git_worktree: z.string().optional(),
})

const Cost = z.object({
  total_cost_usd: z.number().nonnegative().optional(),
  total_duration_ms: z.number().nonnegative().optional(),
  total_api_duration_ms: z.number().nonnegative().optional(),
  total_lines_added: z.number().int().nonnegative().optional(),
  total_lines_removed: z.number().int().nonnegative().optional(),
})

const CurrentUsage = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_creation_input_tokens: z.number().int().nonnegative().optional(),
  cache_read_input_tokens: z.number().int().nonnegative().optional(),
})

const ContextWindow = z.object({
  total_input_tokens: z.number().int().nonnegative().optional(),
  total_output_tokens: z.number().int().nonnegative().optional(),
  context_window_size: z.number().int().positive().optional(),
  used_percentage: z.number().min(0).max(100).nullable().optional(),
  remaining_percentage: z.number().min(0).max(100).nullable().optional(),
  /** null before the first API call in a session. */
  current_usage: CurrentUsage.nullable().optional(),
})

const RateLimitWindow = z.object({
  used_percentage: z.number().min(0).max(100),
  /** Unix epoch seconds when the window resets. */
  resets_at: z.number().int().positive(),
})

/**
 * Pro/Max-subscriber-only. Absent on free tier and API-key auth, plus
 * absent before the first API response in any session. Renderer must
 * handle the absent case.
 */
const RateLimits = z.object({
  five_hour: RateLimitWindow.optional(),
  seven_day: RateLimitWindow.optional(),
})

const Vim = z.object({
  mode: z.enum(['NORMAL', 'INSERT']),
})

const AgentInfo = z.object({
  name: z.string(),
})

const Worktree = z.object({
  name: z.string(),
  path: z.string(),
  /** Absent for hook-based worktrees. */
  branch: z.string().optional(),
  original_cwd: z.string().optional(),
  original_branch: z.string().optional(),
})

export const StatuslineInput = z.object({
  cwd: z.string(),
  session_id: z.string(),
  /** Custom session name set with --name or /rename. */
  session_name: z.string().optional(),
  transcript_path: z.string().optional(),
  model: ModelInfo,
  workspace: Workspace.optional(),
  /** Claude Code version. */
  version: z.string().optional(),
  output_style: z.object({ name: z.string() }).optional(),
  cost: Cost.optional(),
  context_window: ContextWindow.optional(),
  /** True iff most recent response exceeded 200k tokens (fixed threshold). */
  exceeds_200k_tokens: z.boolean().optional(),
  rate_limits: RateLimits.optional(),
  vim: Vim.optional(),
  agent: AgentInfo.optional(),
  worktree: Worktree.optional(),
})
export type StatuslineInputT = z.infer<typeof StatuslineInput>
