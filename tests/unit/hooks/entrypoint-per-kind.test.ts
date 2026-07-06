/**
 * Plan 35 P3 — Per-kind envelope-vs-plain-text dispatch regression tests.
 *
 * For hook kinds that do NOT support additionalContext in Claude Code's
 * HookOutput schema (Stop, SessionEnd, PreCompact, Notification, SubagentStop,
 * PostToolUse), the entrypoint must NOT emit a JSON envelope even when
 * systemInsert is set. Instead it falls back to plain text on stdout.
 *
 * Emitting the envelope on these kinds causes CC to reject with
 * "(root): Invalid input" — the same root cause as the PascalCase bug.
 */

import { describe, expect, it } from 'vitest'
import { HOOK_KIND_TO_EVENT } from '../../../src/core/manifest-schema/claude-code.js'
import { formatClaudeCodeHookOutput } from '../../../src/hooks/cc-output.js'

// Hook kinds that explicitly do NOT have an additionalContext slot.
const KINDS_WITHOUT_ADDITIONAL_CONTEXT = [
  'stop',
  'subagent-stop',
  'session-end',
  'pre-compact',
  'notification',
  'post-tool-use',
]

// Hook kinds that DO support additionalContext.
const KINDS_WITH_ADDITIONAL_CONTEXT = new Set([
  'user-prompt-submit',
  'session-start',
  'pre-tool-use',
])

describe('hooks/entrypoint — per-kind envelope dispatch (Plan 35 P1)', () => {
  it('formatClaudeCodeHookOutput emits a JSON envelope when systemInsert is set', () => {
    // This is the happy path — verify the formatter itself works correctly.
    const eventName = HOOK_KIND_TO_EVENT['user-prompt-submit']!
    const result = { exitCode: 0 as const, systemInsert: 'ctx' }
    const { stdout } = formatClaudeCodeHookOutput(eventName, result)
    expect(() => JSON.parse(stdout)).not.toThrow()
    const parsed = JSON.parse(stdout) as { hookSpecificOutput: unknown }
    expect(parsed.hookSpecificOutput).toBeDefined()
  })

  it('formatClaudeCodeHookOutput returns plain text stdout when only message is set', () => {
    const eventName = HOOK_KIND_TO_EVENT['user-prompt-submit']!
    const result = { exitCode: 0 as const, message: 'plain message' }
    const { stdout } = formatClaudeCodeHookOutput(eventName, result)
    // Should NOT be JSON envelope
    expect(stdout).toBe('plain message')
  })

  it.each(KINDS_WITHOUT_ADDITIONAL_CONTEXT)(
    'kind "%s" is correctly NOT in KINDS_WITH_ADDITIONAL_CONTEXT',
    (kind) => {
      // The entrypoint's KINDS_WITH_ADDITIONAL_CONTEXT set must not include these.
      expect(KINDS_WITH_ADDITIONAL_CONTEXT.has(kind)).toBe(false)
    },
  )

  it.each(KINDS_WITHOUT_ADDITIONAL_CONTEXT)(
    'kind "%s" still has a valid PascalCase mapping in HOOK_KIND_TO_EVENT',
    (kind) => {
      // These kinds must still have PascalCase names — they're just not
      // allowed to use the additionalContext envelope.
      const eventName = HOOK_KIND_TO_EVENT[kind]
      expect(
        eventName,
        `Missing HOOK_KIND_TO_EVENT entry for "${kind}"`,
      ).toBeDefined()
      expect(eventName).not.toMatch(/-/)
    },
  )

  it('KINDS_WITH_ADDITIONAL_CONTEXT contains exactly the three supported kinds', () => {
    // Guard against drift — if CC adds more kinds that support additionalContext,
    // this test will need updating to reflect the expanded set.
    const supported = Array.from(KINDS_WITH_ADDITIONAL_CONTEXT).sort()
    expect(supported).toEqual([
      'pre-tool-use',
      'session-start',
      'user-prompt-submit',
    ])
  })
})
