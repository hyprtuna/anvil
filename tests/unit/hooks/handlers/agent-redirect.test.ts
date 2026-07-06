/**
 * Tests for agent-redirect.ts — PreToolUse handler.
 * Plan 45 / v0.11.0 Phase C2.
 *
 * Uses a real tmpdir with a .anvil/anvil.config.json fixture so that
 * loadWorkflowConfig() (the same path as workflow-guard) picks up the flag.
 * Skill / agent registries are injected as test doubles via the handler's
 * exported factory.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import {
  agentRedirectHandler,
  createAgentRedirectHandler,
} from '../../../../src/hooks/handlers/agent-redirect.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// ─── Test doubles for skill / agent registries ────────────────────────────────

function makeRegistries(opts: {
  skills: string[]
  agents: string[]
}): { hasSkill: (n: string) => boolean; hasAgent: (n: string) => boolean } {
  const skillSet = new Set(opts.skills)
  const agentSet = new Set(opts.agents)
  return {
    hasSkill: (n) => skillSet.has(n),
    hasAgent: (n) => agentSet.has(n),
  }
}

// The test double registries used across tests.
// anvil:code-review → skill; anvil:code-architect → agent
const defaultRegistries = makeRegistries({
  skills: ['code-review', 'tdd-iron-law'],
  agents: ['code-architect', 'plan-verifier'],
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpCwd: string

function writeConfig(dir: string, content: object): void {
  const anvilDir = join(dir, '.anvil')
  mkdirSync(anvilDir, { recursive: true })
  writeFileSync(join(anvilDir, 'anvil.config.json'), JSON.stringify(content))
}

function taskPayload(subagentType: string) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Task',
    tool_input: { subagent_type: subagentType, prompt: 'do something' },
  }
}

function nonTaskPayload(toolName: string) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { file_path: '/tmp/foo.ts' },
  }
}

function mkCtx(payload: unknown, cwd: string = tmpCwd) {
  return {
    kind: 'pre-tool-use' as const,
    cwd,
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

beforeEach(() => {
  tmpCwd = createTestTmpDir('agent-redirect')
})

// ─── 1. Flag OFF — allows everything even if slug is a skill ─────────────────

describe('agent-redirect handler — flag off (default)', () => {
  it('allows Task with anvil:skill-slug when agent_redirect is false', async () => {
    // No config file → agent_redirect defaults to false
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(mkCtx(taskPayload('anvil:code-review')))
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
  })
})

// ─── 2. Flag ON + slug-is-agent → allow ──────────────────────────────────────

describe('agent-redirect handler — flag on, slug is agent', () => {
  it('allows Task with anvil:code-architect (registered agent)', async () => {
    writeConfig(tmpCwd, { agent_redirect: true })
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(mkCtx(taskPayload('anvil:code-architect')))
    expect(r.exitCode).toBe(0)
  })
})

// ─── 3. Flag ON + slug-is-skill → deny exitCode 2 ────────────────────────────

describe('agent-redirect handler — flag on, slug is skill', () => {
  it('denies Task with anvil:code-review (registered skill) — exitCode 2', async () => {
    writeConfig(tmpCwd, { agent_redirect: true })
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(mkCtx(taskPayload('anvil:code-review')))
    expect(r.exitCode).toBe(2)
    expect(r.message).toBeDefined()
    expect(r.message).toContain('anvil:code-review')
    expect(r.message).toContain('Skill({skill: "anvil:code-review"})')
    expect(r.message).toContain('Agent({subagent_type: "anvil:code-review"})')
    expect(r.systemInsert).toBeDefined()
    expect(r.systemInsert).toContain('anvil:code-review')
  })

  it('HookResult shape is valid (strict parse)', async () => {
    writeConfig(tmpCwd, { agent_redirect: true })
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(mkCtx(taskPayload('anvil:code-review')))
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})

// ─── 4. Flag ON + slug-unknown → allow (typo tolerance D-10) ─────────────────

describe('agent-redirect handler — flag on, unknown slug', () => {
  it('allows Task with anvil:does-not-exist (not in either registry)', async () => {
    writeConfig(tmpCwd, { agent_redirect: true })
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(mkCtx(taskPayload('anvil:does-not-exist')))
    expect(r.exitCode).toBe(0)
  })
})

// ─── 5. Flag ON + non-Task tool → allow ──────────────────────────────────────

describe('agent-redirect handler — flag on, non-Task tool', () => {
  it('allows Read tool (not Task) even with flag on', async () => {
    writeConfig(tmpCwd, { agent_redirect: true })
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(mkCtx(nonTaskPayload('Read')))
    expect(r.exitCode).toBe(0)
  })
})

// ─── 6. Flag ON + Task without anvil: prefix → allow ─────────────────────────

describe('agent-redirect handler — flag on, non-anvil subagent_type', () => {
  it('allows Task with generic subagent_type (no anvil: prefix)', async () => {
    writeConfig(tmpCwd, { agent_redirect: true })
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(mkCtx(taskPayload('custom:some-agent')))
    expect(r.exitCode).toBe(0)
  })

  it('allows Task with no subagent_type prefix check', async () => {
    writeConfig(tmpCwd, { agent_redirect: true })
    const handler = createAgentRedirectHandler(defaultRegistries)
    const r = await handler(
      mkCtx({
        tool_name: 'Task',
        tool_input: { prompt: 'plain task without subagent_type' },
      }),
    )
    expect(r.exitCode).toBe(0)
  })
})

// ─── Default export (agentRedirectHandler) smoke test ────────────────────────

describe('agentRedirectHandler (default, real registries)', () => {
  it('returns exitCode 0 by default (no config, real skill/agent registries)', async () => {
    const r = await agentRedirectHandler(
      mkCtx(taskPayload('anvil:code-review')),
    )
    expect(r.exitCode).toBe(0)
  })
})
