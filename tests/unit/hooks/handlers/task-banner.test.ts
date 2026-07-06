import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { taskBannerHandler } from '../../../../src/hooks/handlers/task-banner.js'

const mkCtx = (payload: unknown, env: Record<string, string> = {}) => ({
  kind: 'pre-tool-use' as const,
  cwd: '/tmp',
  config: buildDefaultConfig(),
  env,
  payload,
})

describe('hooks/handlers/task-banner', () => {
  it('emits a banner with subagent_type and description for a Task payload', async () => {
    const payload = {
      session_id: 'x',
      hook_event_name: 'PreToolUse',
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'anvil:code-reviewer',
        description: 'Review init.ts',
        prompt: 'Full prompt text here',
      },
    }
    const r = await taskBannerHandler(mkCtx(payload))
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeDefined()
    expect(r.message).toContain('anvil:code-reviewer')
    expect(r.message).toContain('Review init.ts')
    expect(r.message).toContain('▶')
  })

  it('suppresses banner when ANVIL_TASK_BANNER=off', async () => {
    const payload = {
      session_id: 'x',
      hook_event_name: 'PreToolUse',
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'anvil:code-reviewer',
        description: 'Review init.ts',
        prompt: 'Full prompt text here',
      },
    }
    const r = await taskBannerHandler(
      mkCtx(payload, { ANVIL_TASK_BANNER: 'off' }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
  })

  it('returns exitCode 0 with no message for a non-Task payload (Edit)', async () => {
    const payload = {
      session_id: 'x',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'foo.ts',
        old_string: 'a',
        new_string: 'b',
      },
    }
    const r = await taskBannerHandler(mkCtx(payload))
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
  })

  it('falls back to truncated prompt with ellipsis when description is missing', async () => {
    const longPrompt = 'A'.repeat(80)
    const payload = {
      session_id: 'x',
      hook_event_name: 'PreToolUse',
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'anvil:planning',
        prompt: longPrompt,
      },
    }
    const r = await taskBannerHandler(mkCtx(payload))
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeDefined()
    expect(r.message).toContain('anvil:planning')
    // The prompt is 80 chars; fallback truncates at 60 and appends …
    expect(r.message).toContain('…')
    expect(r.message).toContain('A'.repeat(60))
    // Ensure the full 80-char prompt is NOT present verbatim
    expect(r.message).not.toContain('A'.repeat(61))
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/task-banner — HookResult shape', () => {
  it('passes HookResult.parse() for Task call', async () => {
    const ctx = {
      kind: 'pre-tool-use' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: {
        tool_name: 'Task',
        tool_input: { description: 'test task', subagent_type: 'test' },
      },
    }
    const r = await taskBannerHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() for non-Task call', async () => {
    const ctx = {
      kind: 'pre-tool-use' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { tool_name: 'Read', tool_input: {} },
    }
    const r = await taskBannerHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() when banner suppressed', async () => {
    const ctx = {
      kind: 'pre-tool-use' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: { ANVIL_TASK_BANNER: 'off' },
      payload: { tool_name: 'Task', tool_input: {} },
    }
    const r = await taskBannerHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
