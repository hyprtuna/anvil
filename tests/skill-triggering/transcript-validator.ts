/**
 * ANV-0036 — Deterministic transcript validator for premature-tool-use detection.
 *
 * `validateSkillFiresFirst` checks that the `Skill` tool fires before any
 * other "action" tool in a Claude Code conversation transcript.
 *
 * This is a pure, deterministic function — no Claude API calls needed.
 * The live eval path (ANV-0045) feeds real transcripts to this validator.
 * Unit tests feed synthetic transcripts.
 *
 * Terminology:
 *   - **skill call**: a tool use whose `name` is "Skill" (case-insensitive).
 *   - **action tool**: any tool use that is NOT "Skill", "Read", "Glob", "Grep",
 *     or "TodoRead" — i.e. tools that produce side effects or substantive output
 *     before the skill has been selected.
 *
 * Verdict vocabulary (mirrors the doctor output-conventions four-state):
 *   - `pass`   — Skill fired first (or no action tools found at all).
 *   - `warn`   — Skill fired, but after at least one action tool.
 *   - `fail`   — No Skill call found in the transcript.
 *   - `skip`   — Transcript is empty or contains only read-only tool calls.
 */

/** A single tool-use entry in the transcript. */
export interface TranscriptToolUse {
  /** The tool name as it appears in the transcript (e.g. "Skill", "Bash"). */
  name: string
  /** The tool input (optional — used for richer error messages). */
  input?: Record<string, unknown>
}

/** Verdict returned by `validateSkillFiresFirst`. */
export type SkillFirstVerdict = 'pass' | 'warn' | 'fail' | 'skip'

export interface ValidateSkillFirstResult {
  verdict: SkillFirstVerdict
  /** Human-readable reason for the verdict. */
  reason: string
  /**
   * Index of the first Skill call in the tool-use sequence.
   * -1 when no Skill call was found.
   */
  skillCallIndex: number
  /**
   * Index of the first action tool call in the tool-use sequence.
   * -1 when no action tool was found.
   */
  firstActionIndex: number
}

/**
 * Read-only tools that are acceptable before the Skill call.
 * Expanding this set requires a corresponding test update.
 */
const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'TodoRead',
  'LS',
  'WebSearch',
  'WebFetch',
])

/**
 * Returns true when the tool name refers to the Skill invocation surface.
 */
function isSkillCall(name: string): boolean {
  return name.toLowerCase() === 'skill'
}

/**
 * Returns true when the tool is an "action" tool — one that is NOT read-only
 * and NOT a Skill call. These are the tools whose premature use is a problem.
 */
function isActionTool(name: string): boolean {
  if (isSkillCall(name)) return false
  if (READ_ONLY_TOOLS.has(name)) return false
  return true
}

/**
 * Validate that the `Skill` tool fires before any action tool in a transcript.
 *
 * @param toolUses - Ordered list of tool-use events from the transcript.
 * @returns A structured result with verdict and diagnostic details.
 */
export function validateSkillFiresFirst(
  toolUses: TranscriptToolUse[],
): ValidateSkillFirstResult {
  if (toolUses.length === 0) {
    return {
      verdict: 'skip',
      reason: 'transcript is empty — no tool calls found',
      skillCallIndex: -1,
      firstActionIndex: -1,
    }
  }

  let skillCallIndex = -1
  let firstActionIndex = -1

  for (let i = 0; i < toolUses.length; i++) {
    const tool = toolUses[i]
    if (!tool) continue
    if (skillCallIndex === -1 && isSkillCall(tool.name)) {
      skillCallIndex = i
    }
    if (firstActionIndex === -1 && isActionTool(tool.name)) {
      firstActionIndex = i
    }
    // Short-circuit: once we have both indices we have enough information.
    if (skillCallIndex !== -1 && firstActionIndex !== -1) break
  }

  // All calls were read-only (no Skill, no action tools)
  if (skillCallIndex === -1 && firstActionIndex === -1) {
    return {
      verdict: 'skip',
      reason: 'no Skill call and no action tools — transcript is read-only',
      skillCallIndex: -1,
      firstActionIndex: -1,
    }
  }

  // No Skill call at all
  if (skillCallIndex === -1) {
    const firstActionName = toolUses[firstActionIndex]?.name ?? 'unknown'
    return {
      verdict: 'fail',
      reason: `no Skill call found; first action tool was "${firstActionName}" at index ${firstActionIndex}`,
      skillCallIndex: -1,
      firstActionIndex,
    }
  }

  // Skill fired, but no action tools — clean pass
  if (firstActionIndex === -1) {
    return {
      verdict: 'pass',
      reason: `Skill called at index ${skillCallIndex}; no action tools followed`,
      skillCallIndex,
      firstActionIndex: -1,
    }
  }

  // Both found: check order
  if (skillCallIndex < firstActionIndex) {
    const firstActionName = toolUses[firstActionIndex]?.name ?? 'unknown'
    return {
      verdict: 'pass',
      reason: `Skill called first (index ${skillCallIndex}) before action tool "${firstActionName}" (index ${firstActionIndex})`,
      skillCallIndex,
      firstActionIndex,
    }
  }

  // Action tool fired before Skill — warn
  const firstActionName = toolUses[firstActionIndex]?.name ?? 'unknown'
  return {
    verdict: 'warn',
    reason: `action tool "${firstActionName}" (index ${firstActionIndex}) fired before Skill call (index ${skillCallIndex})`,
    skillCallIndex,
    firstActionIndex,
  }
}
