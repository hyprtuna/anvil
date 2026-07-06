import { describe, expect, it } from 'vitest'
import {
  formatClaudeCodeHookOutput,
  formatDispatchResultForCC,
  truncateUtf8Safe,
} from '../../../../src/adapters/claude-code/hook-output.js'
import type { HookResult } from '../../../../src/core/types.js'
import type { DispatchResult } from '../../../../src/hooks/dispatcher.js'

const EVENT = 'UserPromptSubmit'

describe('truncateUtf8Safe', () => {
  it('returns text unchanged when under the byte limit', () => {
    const text = 'hello world'
    expect(truncateUtf8Safe(text, 100)).toBe(text)
  })

  it('returns text unchanged when exactly at the byte limit', () => {
    // 'a' is 1 byte; 10 chars = 10 bytes
    const text = 'a'.repeat(10)
    expect(truncateUtf8Safe(text, 10)).toBe(text)
  })

  it('truncates and appends suffix when over the byte limit', () => {
    const text = 'a'.repeat(100)
    const result = truncateUtf8Safe(text, 10)
    expect(result.endsWith('\n…(truncated)')).toBe(true)
  })

  it('never splits a multi-byte codepoint', () => {
    // U+1F600 (emoji) = 4 bytes; 8 ASCII + 4-byte emoji = 12 bytes total.
    // Cap at 10: the emoji starts at byte 8 and needs 4 bytes, would overflow.
    const text = 'abcdefgh\u{1F600}'
    const result = truncateUtf8Safe(text, 10)
    // Round-trip must yield valid UTF-8
    const roundTripped = Buffer.from(result, 'utf8').toString('utf8')
    expect(roundTripped).toBe(result)
    // The emoji must be absent (it straddled the boundary)
    expect(result).not.toContain('\u{1F600}')
    expect(result.endsWith('\n…(truncated)')).toBe(true)
  })

  it('cuts at last newline boundary within the codepoint boundary', () => {
    // 'line1\nline2' = 11 bytes. Cap=8 → codepoint boundary=8 ('line1\nli'),
    // last newline at index 5, so kept = 'line1'.
    const text = 'line1\nline2'
    const result = truncateUtf8Safe(text, 8)
    expect(result).toBe('line1\n…(truncated)')
  })
})

describe('formatClaudeCodeHookOutput', () => {
  it('emits JSON envelope when systemInsert is set (under 10KB)', () => {
    const result: HookResult = {
      exitCode: 0,
      systemInsert: 'route to ultra-worker',
    }
    const { stdout, stderr } = formatClaudeCodeHookOutput(EVENT, result)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.hookEventName).toBe(EVENT)
    expect(parsed.hookSpecificOutput.additionalContext).toBe(
      'route to ultra-worker',
    )
    expect(stderr).toBe('')
  })

  it('truncates systemInsert over 10KB with suffix', () => {
    const bigText = 'x'.repeat(15_000)
    const result: HookResult = { exitCode: 0, systemInsert: bigText }
    const { stdout } = formatClaudeCodeHookOutput(EVENT, result)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { additionalContext: string }
    }
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx.endsWith('\n…(truncated)')).toBe(true)
    expect(Buffer.byteLength(ctx, 'utf8')).toBeLessThan(15_000)
  })

  it('handles multi-byte UTF-8 at the boundary without splitting codepoints', () => {
    // 10238 ASCII + 4-byte emoji = 10242 bytes (2 over the 10240 cap)
    const base = 'a'.repeat(10_238)
    const emoji = '\u{1F600}'
    const text = base + emoji
    const result: HookResult = { exitCode: 0, systemInsert: text }
    const { stdout } = formatClaudeCodeHookOutput(EVENT, result)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { additionalContext: string }
    }
    const ctx = parsed.hookSpecificOutput.additionalContext
    // Valid UTF-8 round-trip
    const roundTripped = Buffer.from(ctx, 'utf8').toString('utf8')
    expect(roundTripped).toBe(ctx)
    // Emoji must not be present
    expect(ctx).not.toContain(emoji)
    expect(ctx.endsWith('\n…(truncated)')).toBe(true)
  })

  it('emits plain text stdout when only message is set (no systemInsert)', () => {
    const result: HookResult = { exitCode: 0, message: 'soft banner' }
    const { stdout, stderr } = formatClaudeCodeHookOutput(EVENT, result)
    expect(stdout).toBe('soft banner')
    expect(stderr).toBe('')
  })

  it('emits empty strings when neither message nor systemInsert is set', () => {
    const result: HookResult = { exitCode: 0 }
    const { stdout, stderr } = formatClaudeCodeHookOutput(EVENT, result)
    expect(stdout).toBe('')
    expect(stderr).toBe('')
  })

  it('emits JSON envelope on stdout and message on stderr when both are set', () => {
    const result: HookResult = {
      exitCode: 0,
      message: 'user-visible banner',
      systemInsert: 'model-visible directive',
    }
    const { stdout, stderr } = formatClaudeCodeHookOutput(EVENT, result)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.additionalContext).toBe(
      'model-visible directive',
    )
    expect(stderr).toBe('user-visible banner')
  })
})

describe('formatDispatchResultForCC — sessionStartContext wiring', () => {
  const EVENT = 'SessionStart'

  function makeDispatchResult(
    overrides: Partial<DispatchResult> = {},
  ): DispatchResult {
    return {
      exitCode: 0,
      messages: [],
      trace: [],
      ...overrides,
    }
  }

  it('uses sessionStartContext as the SOLE additionalContext when set', () => {
    const aggregated = 'aggregated context from budget pass'
    const dispatch = makeDispatchResult({ sessionStartContext: aggregated })
    const { stdout, stderr } = formatDispatchResultForCC(EVENT, dispatch)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.hookEventName).toBe(EVENT)
    expect(parsed.hookSpecificOutput.additionalContext).toBe(aggregated)
    expect(stderr).toBe('')
  })

  it('emits messages on stderr when sessionStartContext is set', () => {
    const dispatch = makeDispatchResult({
      sessionStartContext: 'ctx',
      messages: ['[handler-a] ready', '[handler-b] loaded'],
    })
    const { stdout, stderr } = formatDispatchResultForCC(EVENT, dispatch)
    expect(JSON.parse(stdout)).toBeTruthy()
    expect(stderr).toBe('[handler-a] ready\n[handler-b] loaded')
  })

  it('truncates sessionStartContext that exceeds 10KB', () => {
    const big = 'x'.repeat(15_000)
    const dispatch = makeDispatchResult({ sessionStartContext: big })
    const { stdout } = formatDispatchResultForCC(EVENT, dispatch)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { additionalContext: string }
    }
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx.endsWith('\n…(truncated)')).toBe(true)
    expect(Buffer.byteLength(ctx, 'utf8')).toBeLessThan(15_000)
  })

  it('emits empty stdout when sessionStartContext is absent', () => {
    const dispatch = makeDispatchResult()
    const { stdout, stderr } = formatDispatchResultForCC(EVENT, dispatch)
    expect(stdout).toBe('')
    expect(stderr).toBe('')
  })

  it('does NOT emit per-handler systemInsert when sessionStartContext is set', () => {
    // This is the core ANV-0056 contract: the aggregate budget takes over;
    // individual per-result systemInserts must not leak into the output.
    const dispatch = makeDispatchResult({
      sessionStartContext: 'aggregate only',
      // messages would normally contain per-handler outputs
      messages: ['[h] some message'],
    })
    const { stdout } = formatDispatchResultForCC(EVENT, dispatch)
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput: { additionalContext: string }
    }
    // The additionalContext must be the aggregated string, not any per-handler content
    expect(parsed.hookSpecificOutput.additionalContext).toBe('aggregate only')
  })

  it('accepts perResultMessages override for stderr', () => {
    const dispatch = makeDispatchResult({ sessionStartContext: 'ctx' })
    const { stderr } = formatDispatchResultForCC(EVENT, dispatch, [
      'override msg',
    ])
    expect(stderr).toBe('override msg')
  })
})
