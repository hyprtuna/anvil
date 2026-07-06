import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { loadAllHooks } from '../../../src/hooks/load-all.js'

describe('hooks/load-all', () => {
  it('registers all default hook handlers (v0.15.2: 36 = 34 prior + 2 cc-task-events)', () => {
    const reg = loadAllHooks({ config: buildDefaultConfig() })
    const allHooks = reg.getAll()
    // v0.11.0: dropped deprecated preCompactHandler + standalone rules-injector
    // (rules-injector is still loaded inline by the pre-tool-use multiplexer).
    // ANV-0023 (v0.14.0): +3 observability handlers (instructions-loaded,
    // pre-compact (observability companion), post-compact-on-session-start).
    // ANV-0125 (v0.15.2): +1 memory-validator (PreToolUse for CLAUDE.md/AGENTS.md).
    // ANV-0124 (v0.15.2): +1 rule-reinforcement (UserPromptSubmit).
    // ANV-0126 (v0.15.2): +1 pre-compact-sidecar (runtime sidecar writer).
    // ANV-0175 (v0.15.2): +2 cc-task-events (PreToolUse + SubagentStop observers).
    expect(allHooks).toHaveLength(36)
    const kinds = allHooks.map((h) => h.kind)
    expect(kinds).toContain('session-start')
    expect(kinds).toContain('session-end')
    expect(kinds).toContain('pre-compact')
    expect(kinds).toContain('pre-tool-use')
    expect(kinds).toContain('post-tool-use')
    expect(kinds).toContain('notification')
    expect(kinds).toContain('stop')
    expect(kinds).toContain('subagent-stop')
    const names = allHooks.map((h) => h.name)
    expect(names).toContain('rules-prompt-injector:session-start')
    expect(names).toContain('rules-prompt-injector:user-prompt-submit')
    expect(names).toContain('pre-tool-use')
    // Plan 39 Phase F — GateGuard
    expect(names).toContain('gateguard')
    expect(names).toContain('gateguard-state')
    expect(names).toContain('gateguard-state:user-prompt-submit')
    // Plan 39 Phase H — post-edit accumulator
    expect(names).toContain('post-edit-accumulator')
    // ANV-0023 — context observability hooks
    expect(names).toContain('observability:instructions-loaded')
    expect(names).toContain('observability:pre-compact')
    expect(names).toContain('observability:post-compact')
    // ANV-0125 — memory-file structural validator
    expect(names).toContain('memory-validator')
    // ANV-0124 — rule-reinforcement (UserPromptSubmit)
    expect(names).toContain('rule-reinforcement')
    // ANV-0126 — pre-compact sidecar handler
    expect(names).toContain('pre-compact-sidecar')
    // ANV-0175 Phase A — cc-task-events observers (PreToolUse + SubagentStop)
    expect(names).toContain('cc-task-events:created')
    expect(names).toContain('cc-task-events:completed')
    const ccTaskCreated = allHooks.find(
      (h) => h.name === 'cc-task-events:created',
    )
    expect(ccTaskCreated?.kind).toBe('pre-tool-use')
    expect(ccTaskCreated?.async).toBe(true)
    const ccTaskCompleted = allHooks.find(
      (h) => h.name === 'cc-task-events:completed',
    )
    expect(ccTaskCompleted?.kind).toBe('subagent-stop')
    expect(ccTaskCompleted?.async).toBe(true)
  })

  it('respects the config.disabled.hooks array', () => {
    const cfg = buildDefaultConfig()
    cfg.disabled.hooks = ['pre-commit']
    const reg = loadAllHooks({ config: cfg })
    const preCommit = reg.getAll().find((h) => h.kind === 'pre-commit')
    expect(preCommit?.enabled).toBe(false)
    const prePush = reg.getAll().find((h) => h.kind === 'pre-push')
    expect(prePush?.enabled).toBe(true)
  })

  it('profile=minimal enables only security hooks', () => {
    const cfg = buildDefaultConfig()
    const reg = loadAllHooks({
      config: cfg,
      env: { ANVIL_HOOK_PROFILE: 'minimal' },
    })
    const enabled = reg.getAll().filter((h) => h.enabled)
    const enabledKinds = enabled.map((h) => h.kind)
    expect(enabledKinds).toContain('pre-commit')
    expect(enabledKinds).toContain('pre-push')
    expect(enabledKinds).toContain('prompt-guard')
    expect(enabledKinds).toContain('read-guard')
    expect(enabledKinds).toContain('workflow-guard')
    expect(enabledKinds).not.toContain('session-start')
    expect(enabledKinds).not.toContain('post-edit')
    expect(enabledKinds).not.toContain('context-monitor')
  })

  it('profile=standard uses config.disabled.hooks (default behavior)', () => {
    const cfg = buildDefaultConfig()
    const reg = loadAllHooks({
      config: cfg,
      env: { ANVIL_HOOK_PROFILE: 'standard' },
    })
    const sessionStart = reg.getAll().find((h) => h.kind === 'session-start')
    expect(sessionStart?.enabled).toBe(true)
    const contextMonitor = reg
      .getAll()
      .find((h) => h.kind === 'context-monitor')
    expect(contextMonitor?.enabled).toBe(false)
  })

  it('profile=strict enables all hooks', () => {
    const cfg = buildDefaultConfig()
    const reg = loadAllHooks({
      config: cfg,
      env: { ANVIL_HOOK_PROFILE: 'strict' },
    })
    const disabled = reg.getAll().filter((h) => !h.enabled)
    expect(disabled).toHaveLength(0)
  })

  it('ignores invalid profile values and falls back to standard', () => {
    const cfg = buildDefaultConfig()
    const reg = loadAllHooks({
      config: cfg,
      env: { ANVIL_HOOK_PROFILE: 'bogus' },
    })
    const contextMonitor = reg
      .getAll()
      .find((h) => h.kind === 'context-monitor')
    expect(contextMonitor?.enabled).toBe(false)
  })
})
