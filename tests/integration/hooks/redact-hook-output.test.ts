/**
 * ANV-0052 — Integration: dispatcher redacts tokens in hook output.
 *
 * Wires a hook that returns a message containing a raw secret token through
 * the dispatcher, then asserts that:
 * 1. `messages[]` in the DispatchResult does NOT contain the raw token.
 * 2. `trace[].message` does NOT contain the raw token.
 * 3. The <<REDACTED:*>> marker IS present in at least one of the above.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookResult } from '../../../src/core/types.js'
import { dispatch } from '../../../src/hooks/dispatcher.js'

const baseCtx = () => ({
  kind: 'pre-commit' as const,
  cwd: '/tmp/test',
  config: buildDefaultConfig(),
  env: {},
  payload: null,
})

const RAW_TOKEN = 'sk-ant-api03-LEAKTEST1234567890abcdef'

describe('integration/hooks/redact-hook-output — dispatcher redacts tokens', () => {
  it('messages[] never contains a raw sk-ant-api token from hook output', async () => {
    const reg = new HookRegistry()
    reg.register(
      'leaky-handler',
      'pre-commit',
      async (): Promise<HookResult> => {
        return { exitCode: 0, message: `key ${RAW_TOKEN}` }
      },
    )

    const result = await dispatch(reg, baseCtx())

    // The raw token must not appear in any message
    for (const msg of result.messages) {
      expect(msg).not.toContain(RAW_TOKEN)
    }

    // At least one message must contain the redaction marker
    const anyRedacted = result.messages.some((m) =>
      m.includes('<<REDACTED:anthropic>>'),
    )
    expect(anyRedacted).toBe(true)
  })

  it('trace[].message never contains a raw sk-ant-api token', async () => {
    const reg = new HookRegistry()
    reg.register(
      'leaky-tracer',
      'pre-commit',
      async (): Promise<HookResult> => {
        return { exitCode: 0, message: `token ${RAW_TOKEN}` }
      },
    )

    const result = await dispatch(reg, baseCtx())

    for (const entry of result.trace) {
      if (entry.message !== undefined) {
        expect(entry.message).not.toContain(RAW_TOKEN)
      }
    }
  })

  it('dispatcher handles a Bearer token in hook message and redacts it', async () => {
    const bearerToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const reg = new HookRegistry()
    reg.register(
      'bearer-handler',
      'pre-commit',
      async (): Promise<HookResult> => {
        return { exitCode: 0, message: `Authorization: Bearer ${bearerToken}` }
      },
    )

    const result = await dispatch(reg, baseCtx())

    for (const msg of result.messages) {
      expect(msg).not.toContain(bearerToken)
    }
  })
})
