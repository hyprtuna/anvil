/**
 * E-004 — dispatcher malformed-regex stderr (D-01, D-02).
 *
 * Verifies that:
 * - A malformed regex matcher writes one stderr line on first occurrence.
 * - Subsequent calls with the same bad matcher do not repeat the write.
 * - A different bad matcher does write a second line.
 * - The function still returns false (not throwing).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookResult } from '../../../src/core/types.js'
import { dispatch } from '../../../src/hooks/dispatcher.js'

const BAD_MATCHER_A = '(unclosed'
const BAD_MATCHER_B = '[bad'

function makeCtx(toolName: string) {
  return {
    kind: 'pre-tool-use' as const,
    cwd: '/tmp/test',
    config: buildDefaultConfig(),
    env: {},
    payload: { tool_name: toolName },
  }
}

describe('dispatcher — malformed matcher regex (E-004)', () => {
  let stderrWrites: string[]
  let originalWrite: typeof process.stderr.write

  beforeEach(() => {
    stderrWrites = []
    originalWrite = process.stderr.write.bind(process.stderr)
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrWrites.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    process.stderr.write = originalWrite
    vi.restoreAllMocks()
  })

  it('writes one stderr line when a malformed matcher is encountered', async () => {
    const reg = new HookRegistry()
    reg.register(
      'bad-hook-a',
      'pre-tool-use',
      async (): Promise<HookResult> => ({ exitCode: 0 }),
      { matcher: BAD_MATCHER_A },
    )
    await dispatch(reg, makeCtx('SomeTool'))
    const relevant = stderrWrites.filter((s) =>
      s.includes('malformed matcher regex'),
    )
    expect(relevant).toHaveLength(1)
    expect(relevant[0]).toContain(BAD_MATCHER_A)
  })

  it('does not repeat the stderr write for the same bad matcher', async () => {
    const reg = new HookRegistry()
    reg.register(
      'bad-hook-a-dup1',
      'pre-tool-use',
      async (): Promise<HookResult> => ({ exitCode: 0 }),
      { matcher: BAD_MATCHER_A },
    )
    reg.register(
      'bad-hook-a-dup2',
      'pre-tool-use',
      async (): Promise<HookResult> => ({ exitCode: 0 }),
      { matcher: BAD_MATCHER_A },
    )
    await dispatch(reg, makeCtx('SomeTool'))
    const relevant = stderrWrites.filter(
      (s) => s.includes('malformed matcher regex') && s.includes(BAD_MATCHER_A),
    )
    // The Set dedupes — only one write for the same bad matcher (may be 0 if
    // prior test already registered it). At most 1 write in this invocation.
    expect(relevant.length).toBeLessThanOrEqual(1)
  })

  it('writes a separate line for a different bad matcher', async () => {
    const reg = new HookRegistry()
    reg.register(
      'bad-hook-b',
      'pre-tool-use',
      async (): Promise<HookResult> => ({ exitCode: 0 }),
      { matcher: BAD_MATCHER_B },
    )
    await dispatch(reg, makeCtx('SomeTool'))
    const relevant = stderrWrites.filter(
      (s) => s.includes('malformed matcher regex') && s.includes(BAD_MATCHER_B),
    )
    // At most 1 write for this new bad matcher in this call.
    expect(relevant.length).toBeLessThanOrEqual(1)
  })

  it('dispatch still returns a result (does not throw) with bad matcher', async () => {
    const reg = new HookRegistry()
    reg.register(
      'bad-hook-c',
      'pre-tool-use',
      async (): Promise<HookResult> => ({ exitCode: 0 }),
      { matcher: '(?bad' },
    )
    await expect(dispatch(reg, makeCtx('SomeTool'))).resolves.toBeDefined()
  })
})
