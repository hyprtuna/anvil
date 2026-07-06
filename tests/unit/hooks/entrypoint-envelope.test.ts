/**
 * Plan 35 P3 — Regression tests for the kebab→PascalCase hookEventName fix.
 *
 * For each hook kind that can emit systemInsert, asserts that the envelope
 * written to stdout contains the PascalCase hookEventName (not the
 * kebab-case kind string). Uses HOOK_KIND_TO_EVENT as the source of truth.
 *
 * Root cause: entrypoint.ts was emitting `hookEventName: kind` (kebab-case)
 * instead of `hookEventName: HOOK_KIND_TO_EVENT[kind]` (PascalCase). Claude
 * Code's HookOutput discriminated union rejects kebab-case with
 * "(root): Invalid input", causing a ~5 minute subprocess hang.
 */

import { describe, expect, it } from 'vitest'
import { HOOK_KIND_TO_EVENT } from '../../../src/core/manifest-schema/claude-code.js'
import { formatClaudeCodeHookOutput } from '../../../src/hooks/cc-output.js'

// Hook kinds that emit systemInsert and support additionalContext in CC.
const KINDS_WITH_ADDITIONAL_CONTEXT = [
  'user-prompt-submit',
  'session-start',
  'pre-tool-use',
]

describe('hooks/entrypoint — PascalCase hookEventName in CC envelope (Plan 35 P1)', () => {
  it.each(KINDS_WITH_ADDITIONAL_CONTEXT)(
    'kind "%s" emits PascalCase hookEventName in envelope',
    (kind) => {
      const eventName = HOOK_KIND_TO_EVENT[kind]
      expect(
        eventName,
        `HOOK_KIND_TO_EVENT missing entry for "${kind}"`,
      ).toBeDefined()

      // Simulate what the entrypoint now does: look up PascalCase then format.
      const result = { exitCode: 0 as const, systemInsert: 'test context' }
      const { stdout } = formatClaudeCodeHookOutput(eventName!, result)

      const parsed = JSON.parse(stdout) as {
        hookSpecificOutput: { hookEventName: string; additionalContext: string }
      }

      // Must be PascalCase (matches CC schema).
      expect(parsed.hookSpecificOutput.hookEventName).toBe(eventName)

      // Must NOT be the raw kebab-case kind string.
      expect(parsed.hookSpecificOutput.hookEventName).not.toBe(kind)

      // Must not contain hyphens (simple kebab-case guard).
      expect(parsed.hookSpecificOutput.hookEventName).not.toMatch(/-/)
    },
  )

  it('user-prompt-submit maps to "UserPromptSubmit"', () => {
    expect(HOOK_KIND_TO_EVENT['user-prompt-submit']).toBe('UserPromptSubmit')
  })

  it('session-start maps to "SessionStart"', () => {
    expect(HOOK_KIND_TO_EVENT['session-start']).toBe('SessionStart')
  })

  it('pre-tool-use maps to "PreToolUse"', () => {
    expect(HOOK_KIND_TO_EVENT['pre-tool-use']).toBe('PreToolUse')
  })

  it('envelope additionalContext carries the systemInsert text', () => {
    const eventName = HOOK_KIND_TO_EVENT['user-prompt-submit']!
    const result = {
      exitCode: 0 as const,
      systemInsert: 'routing directive here',
    }
    const { stdout } = formatClaudeCodeHookOutput(eventName, result)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.additionalContext).toBe(
      'routing directive here',
    )
  })

  it('message goes to stderr channel, not stdout, when systemInsert is set', () => {
    const eventName = HOOK_KIND_TO_EVENT['user-prompt-submit']!
    const result = {
      exitCode: 0 as const,
      systemInsert: 'directive',
      message: 'user message',
    }
    const { stdout, stderr } = formatClaudeCodeHookOutput(eventName, result)
    // stdout should be JSON envelope only
    expect(() => JSON.parse(stdout)).not.toThrow()
    // message goes to stderr channel
    expect(stderr).toBe('user message')
    // stdout (the envelope) must not contain the message text as plain text
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    expect(JSON.stringify(parsed)).not.toContain('user message')
  })
})
