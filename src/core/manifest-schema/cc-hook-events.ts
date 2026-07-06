/**
 * ANV-0070 — Claude Code hook event coverage matrix.
 *
 * Claude Code documents 30 hook lifecycle events. Anvil currently maps 9 of
 * them via `HOOK_KIND_TO_EVENT` in `claude-code.ts`. This module is the
 * single source of truth for the full 30-event registry, recording Anvil's
 * disposition for every event so `anvil doctor` can surface the coverage
 * matrix and flag gaps.
 *
 * Disposition semantics:
 *   mapped       — Anvil has a HookKind + handler wired to this CC event.
 *   future       — Anvil does not map this event today but intends to.
 *   out-of-scope — Anvil explicitly defers or has no equivalent concept.
 *
 * Layer note: this module is layer 0 (core). It may be imported by layer-4
 * doctor. No imports from higher layers.
 */

/** Disposition of an Anvil hook relative to a Claude Code hook event. */
export type HookEventStatus = 'mapped' | 'out-of-scope' | 'future'

/** A single entry in the CC hook event registry. */
export interface CCHookEvent {
  /** The exact event name as documented by Claude Code. */
  event: string
  /** Anvil's current disposition for this event. */
  status: HookEventStatus
  /** One-line rationale for the disposition. */
  note: string
}

/**
 * All 30 Claude Code hook events with Anvil's disposition.
 *
 * Source: Claude Code hook documentation (30 events).
 * Mapped events must correspond to entries in `HOOK_KIND_TO_EVENT` in
 * `claude-code.ts`; the unit test enforces this alignment.
 */
export const CC_HOOK_EVENTS: readonly CCHookEvent[] = [
  // ── Currently mapped (8) — must align with HOOK_KIND_TO_EVENT in claude-code.ts ──
  // Note: Anvil's adapter also maps `session-end` → CC `SessionEnd`, but SessionEnd
  // is not in CC's standard 30-event documentation and is excluded from this registry.
  {
    event: 'PreToolUse',
    status: 'mapped',
    note: 'Anvil kind: pre-tool-use; blocking guard before any tool call.',
  },
  {
    event: 'PostToolUse',
    status: 'mapped',
    note: 'Anvil kind: post-tool-use; advisory inspection after tool call.',
  },
  {
    event: 'Notification',
    status: 'mapped',
    note: 'Anvil kind: notification; surfaces CC-generated user alerts.',
  },
  {
    event: 'Stop',
    status: 'mapped',
    note: 'Anvil kind: stop; lifecycle end of the main agent loop.',
  },
  {
    event: 'SubagentStop',
    status: 'mapped',
    note: 'Anvil kind: subagent-stop; lifecycle end of a sub-agent run.',
  },
  {
    event: 'PreCompact',
    status: 'mapped',
    note: 'Anvil kind: pre-compact; fires before context window compaction.',
  },
  {
    event: 'UserPromptSubmit',
    status: 'mapped',
    note: 'Anvil kind: user-prompt-submit; intercepts each user message.',
  },
  {
    event: 'SessionStart',
    status: 'mapped',
    note: 'Anvil kind: session-start; fires once when a CC session opens.',
  },
  // ── Future — planned additions (13) ──────────────────────────────────
  {
    event: 'Setup',
    status: 'future',
    note: 'Pre-session env setup; useful for toolchain validation before session-start.',
  },
  {
    event: 'PostToolUseFailure',
    status: 'future',
    note: 'Error-path complement to PostToolUse; enables targeted error recovery hooks.',
  },
  {
    event: 'PostToolBatch',
    status: 'future',
    note: 'Batch completion event useful for aggregate cost/rate-limit accounting.',
  },
  {
    event: 'UserPromptExpansion',
    status: 'future',
    note: 'Post-expansion hook enables final prompt inspection before model sees it.',
  },
  {
    event: 'PermissionRequest',
    status: 'future',
    note: 'Intercept permission dialogs; enables automated approval policies.',
  },
  {
    event: 'SubagentStart',
    status: 'future',
    note: 'Sub-agent lifecycle complement to SubagentStop; enables scoped context injection.',
  },
  {
    event: 'TaskCreated',
    status: 'future',
    note: 'Task-graph event; enables orchestration-aware routing decisions.',
  },
  {
    event: 'TaskCompleted',
    status: 'future',
    note: 'Task-graph event; enables post-task cleanup or summary hooks.',
  },
  {
    event: 'PostCompact',
    status: 'future',
    note: 'Post-compaction hook; complement to PreCompact for state reconciliation.',
  },
  {
    event: 'Elicitation',
    status: 'future',
    note: 'Intercept CC elicitation requests; enables automated structured-input handling.',
  },
  {
    event: 'ElicitationResult',
    status: 'future',
    note: 'Post-elicitation result; enables validation of user-provided structured data.',
  },
  {
    event: 'PostEdit',
    status: 'future',
    note: 'Anvil already handles post-edit via post-edit kind (git/editor); map to CC event.',
  },
  {
    event: 'PreCommit',
    status: 'future',
    note: 'Anvil has pre-commit kind; wiring to CC PreCommit event is a natural mapping.',
  },
  // ── Out-of-scope — deferred or no Anvil equivalent (9) ───────────────
  {
    event: 'TeammateIdle',
    status: 'out-of-scope',
    note: 'Multi-agent team coordination; out of scope for single-agent Anvil installs.',
  },
  {
    event: 'InstructionsLoaded',
    status: 'out-of-scope',
    note: 'CC-internal event fired when CLAUDE.md loads; no actionable Anvil hook target.',
  },
  {
    event: 'ConfigChange',
    status: 'out-of-scope',
    note: 'Reacts to live config mutations; Anvil manages config separately via init/install.',
  },
  {
    event: 'CwdChanged',
    status: 'out-of-scope',
    note: 'Working-directory change; Anvil detects project root once at session start.',
  },
  {
    event: 'FileChanged',
    status: 'out-of-scope',
    note: 'File-watch event; Anvil defers file-change reactions to post-edit hooks.',
  },
  {
    event: 'WorktreeCreate',
    status: 'out-of-scope',
    note: 'Git worktree lifecycle; Anvil uses worktrees for isolation but does not hook creation.',
  },
  {
    event: 'WorktreeRemove',
    status: 'out-of-scope',
    note: 'Git worktree lifecycle; cleanup is handled by the agent isolation layer, not hooks.',
  },
  {
    event: 'PrePush',
    status: 'out-of-scope',
    note: 'Anvil has pre-push kind wired via git hooks directly, not via CC hook events.',
  },
  {
    event: 'OnError',
    status: 'out-of-scope',
    note: 'Anvil on-error kind fires at handler level; CC OnError duplicates that coverage.',
  },
]

// Runtime guard: throws immediately at module load if the count drifts from 30.
if (CC_HOOK_EVENTS.length !== 30) {
  throw new Error(
    `CC_HOOK_EVENTS must have exactly 30 entries, found ${CC_HOOK_EVENTS.length}`,
  )
}
