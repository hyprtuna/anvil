/**
 * ANV-0022 — Command safety metadata registry.
 *
 * Every Anvil CLI command is listed here with its MCP-canonical 4-tuple
 * safety annotation:
 *
 *   readOnlyHint    — no persistent side-effects.
 *   destructiveHint — may irreversibly destroy or overwrite data.
 *   idempotentHint  — running N times ≡ running once.
 *   openWorldHint   — may contact external systems (network, APIs, git remotes).
 *
 * The doctor row (`anvil doctor`) warns when any command is missing
 * annotations or carries contradictory ones (readOnly + destructive).
 *
 * Scope: COMMAND surface only. Tool/hook annotations live in ANV-0051.
 */

import type { CommandRegistryEntry } from '../../../core/types.js'

// ─── Registry ───────────────────────────────────────────────────────────────

export const COMMAND_REGISTRY: CommandRegistryEntry[] = [
  // ── Lifecycle ───────────────────────────────────────────────────────────
  {
    name: 'init',
    description: 'Install Anvil into a project or globally',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'upgrade',
    description: 'Upgrade Anvil installation in place',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'uninstall',
    description: 'Remove Anvil from this project or globally',
    safety: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Diagnostics ─────────────────────────────────────────────────────────
  {
    name: 'doctor',
    description: 'Diagnose the installation',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Statusline ──────────────────────────────────────────────────────────
  {
    name: 'statusline',
    description: 'Render the Claude Code statusline',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'statusline install',
    description: 'Wire the Anvil statusline into Claude Code settings.json',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'statusline subagent',
    description: 'Render subagent panel JSON',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'statusline tier',
    description: 'Read or set the active statusline display tier',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'statusline template',
    description: 'Read or set the active statusline rendering template',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Models ──────────────────────────────────────────────────────────────
  {
    name: 'models list',
    description: 'Show every skill with its resolved model',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'models show',
    description: 'Show full resolution trace for one skill',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'models set',
    description: 'Set per-skill model override',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'models set-group',
    description: 'Update a whole model group',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'models use',
    description: 'Apply a model preset',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'models reset',
    description: 'Restore model defaults',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'models validate',
    description: 'Check models.json for schema violations',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'model',
    description: 'Set or show the session-scoped model override',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Settings ────────────────────────────────────────────────────────────
  {
    name: 'settings show',
    description: 'Print the merged Claude Code settings as JSON',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'settings validate',
    description: 'Validate .claude/settings.json against the Anvil schema',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Hooks ───────────────────────────────────────────────────────────────
  {
    name: 'hooks list',
    description: 'List registered hooks',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Skills ──────────────────────────────────────────────────────────────
  {
    name: 'skill list',
    description: 'List user-invocable skills',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill validate',
    description: 'Validate a skill file',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill enable',
    description: 'Enable a skill',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill disable',
    description: 'Disable a skill',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill reload',
    description: 'Reload skills from disk',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill create',
    description: 'Scaffold a new skill',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'skill run',
    description: "Render a skill's prompt + resolved model",
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill select',
    description: 'Run the skill-selection against a prompt',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill search',
    description: 'Search skills by name, description, trigger, or tag',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'skill eval',
    description: 'Evaluate a skill against its fixture suite',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  // ── Workflow / Plan ──────────────────────────────────────────────────────
  {
    name: 'plan',
    description: 'Invoke the plan-writing skill for an active feature',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'plan-audit',
    description: 'Run plan-verifier audit gate on a plan markdown file',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'plan-validate-coverage',
    description: 'Map plan tasks to test commands',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'plan-status',
    description: 'Read-only status of a plan run (ANV-0025 Wave 3)',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'plan-check-decisions',
    description:
      'Check that every decisions block entry is referenced in the plan',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'review',
    description: 'Invoke the code-reviewer skill',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'debug',
    description: 'Invoke the debugging skill',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'tdd',
    description: 'Invoke the test-driven-development skill chain',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'ultra',
    description: 'Invoke the ultra-worker agent',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'explore',
    description: 'Invoke the project-exploration skill',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'pr',
    description: 'Invoke github-workflow or gitlab-workflow (auto-detect)',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'agents',
    description: 'Invoke the orchestrator for parallel sub-agents',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'orchestrate',
    description:
      'Invoke the orchestrator with optional parallel background fan-out',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'verify',
    description: 'Run post-implementation verification',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'start-research',
    description: 'Start research on a topic before implementation',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'quick',
    description: 'Execute an ad-hoc task without full planning',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'progress',
    description: 'Show current branch, recent commits, cost, and next action',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'pause',
    description: 'Save current work state for session continuity',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'resume',
    description: 'Restore saved work state',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'discuss',
    description: 'Structured decision capture',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'finish',
    description:
      'Complete a development branch: verify tests, then merge, PR, keep, or discard',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'pr-branch',
    description:
      'Create a planning-free PR branch by cherry-picking only code commits',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  // ── Worktree (ANV-0155) ──────────────────────────────────────────────────
  {
    name: 'worktree create',
    description: 'Create a git worktree for a ticket',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'worktree cleanup',
    description: 'Remove merged .worktrees/* entries',
    safety: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'release',
    description:
      'Run the release ceremony: bump versions, rewrite tests, flip slate status, prepend CHANGELOG',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'route',
    description: 'Show routing diagnostics for a prompt',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'recommend',
    description:
      'Recommend Anvil skills, agents, hooks, and MCPs based on detected project signals',
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'note',
    description: 'Zero-friction idea capture',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'revise-claude-md',
    description: 'Audit and improve CLAUDE.md files',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'notepad',
    description: 'Per-branch token-bounded breadcrumb system',
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
]

// ─── Coverage computation (consumed by doctor row) ──────────────────────────

export interface CommandSafetyCoverageResult {
  status: 'pass' | 'warn' | 'skip'
  covered: number
  total: number
  /** Command names with contradictory readOnlyHint=true + destructiveHint=true. */
  contradictory: string[]
}

/**
 * ANV-0022 — Pure coverage function consumed by the doctor row.
 *
 * A command is "covered" when all four MCP hint fields are present
 * and are boolean values.
 */
export function computeCommandSafetyCoverage(
  cmds: Array<{
    name: string
    safety: {
      readOnlyHint: boolean
      destructiveHint: boolean
      idempotentHint: boolean
      openWorldHint: boolean
    }
  }>,
): CommandSafetyCoverageResult {
  const total = cmds.length
  if (total === 0) {
    return { status: 'skip', covered: 0, total: 0, contradictory: [] }
  }

  const contradictory: string[] = []
  let covered = 0

  for (const cmd of cmds) {
    const a = cmd.safety
    const fullyAnnotated =
      typeof a.readOnlyHint === 'boolean' &&
      typeof a.destructiveHint === 'boolean' &&
      typeof a.idempotentHint === 'boolean' &&
      typeof a.openWorldHint === 'boolean'

    if (fullyAnnotated) {
      covered++
    }

    if (a.readOnlyHint && a.destructiveHint) {
      contradictory.push(cmd.name)
    }
  }

  const status: 'pass' | 'warn' =
    covered === total && contradictory.length === 0 ? 'pass' : 'warn'

  return { status, covered, total, contradictory }
}
