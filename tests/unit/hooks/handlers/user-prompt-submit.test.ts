import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { getProjectScopedPath } from '../../../../src/core/io/project-scoped-paths.js'
import { RoutingDecision } from '../../../../src/core/types.js'
import { HookResult } from '../../../../src/core/types.js'
import { userPromptSubmitHandler } from '../../../../src/hooks/handlers/user-prompt-submit.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

const mkCtx = (payload: unknown, env: Record<string, string> = {}) => ({
  kind: 'user-prompt-submit' as const,
  cwd: '/tmp',
  config: buildDefaultConfig(),
  env,
  payload,
})

describe('hooks/handlers/user-prompt-submit', () => {
  it('returns SUCCESS for a non-empty prompt', async () => {
    const r = await userPromptSubmitHandler(mkCtx('Please review this code'))
    expect(r.exitCode).toBe(0)
  })

  it('returns WARN for an empty prompt', async () => {
    const r = await userPromptSubmitHandler(mkCtx(''))
    expect(r.exitCode).toBe(1)
    expect(r.message).toBe('empty prompt detected')
  })

  it('returns WARN for a whitespace-only prompt', async () => {
    const r = await userPromptSubmitHandler(mkCtx('   '))
    expect(r.exitCode).toBe(1)
    expect(r.message).toBe('empty prompt detected')
  })

  it('attaches a RoutingDecision on ctx.context.routingDecision', async () => {
    const r = await userPromptSubmitHandler(mkCtx('debug the failing tests'))
    expect(r.exitCode).toBe(0)
    const routing = (r.context as { routingDecision?: unknown }).routingDecision
    expect(routing).toBeDefined()
    const parsed = RoutingDecision.parse(routing)
    expect(parsed.intent).toBe('debug')
    expect(parsed.agent).toBe('ultra-worker')
    expect(parsed.skills).toContain('debugging')
  })

  it('does not attach legacy detectedIntents or intentDetails', async () => {
    const r = await userPromptSubmitHandler(mkCtx('debug the failing tests'))
    const ctx = r.context as Record<string, unknown>
    expect(ctx.detectedIntents).toBeUndefined()
    expect(ctx.intentDetails).toBeUndefined()
  })

  // ─── Routing banner tests ─────────────────────────────────────────────────

  it('emits the directive banner for a high-confidence prompt (≥ 0.75)', async () => {
    // "debug this null pointer exception" matches debug unambiguously =
    // 100% confidence. isDirective() fires, so the multi-line DIRECTIVE
    // banner is rendered instead of the single-line advisory.
    const r = await userPromptSubmitHandler(
      mkCtx('debug this null pointer exception'),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeDefined()
    expect(r.message).toContain('DIRECTIVE')
    expect(r.message).toContain('ultra-worker')
    expect(r.message).toContain('(debug,')
  })

  it('emits the advisory banner for a mid-confidence prompt (< 0.65)', async () => {
    // Flat multi-intent: "review" (weight 3), "debug" (weight 3 via "bug"),
    // "test" (weight 2), "plan" (weight 3), "research" (weight 2) — flat
    // distribution keeps confidence below the 0.65 directive threshold.
    // Plan 31 A5 formula with top=3, secondary=3, total≈13:
    //   numerator=3+0.9=3.9; denominator=3+3+7=13; conf≈0.30 < 0.65 → advisory
    const r = await userPromptSubmitHandler(
      mkCtx('review the bug in the test plan and research alternatives'),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeDefined()
    expect(r.message).not.toContain('DIRECTIVE')
    expect(r.message).toMatch(/^▶/)
  })

  it('suppresses the banner when ANVIL_ROUTING_BANNER=off', async () => {
    const r = await userPromptSubmitHandler(
      mkCtx('debug this null pointer exception', {
        ANVIL_ROUTING_BANNER: 'off',
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
  })

  it('suppresses the banner when ANVIL_ROUTING_BANNER=0', async () => {
    const r = await userPromptSubmitHandler(
      mkCtx('debug this null pointer exception', { ANVIL_ROUTING_BANNER: '0' }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
  })

  it('suppresses the banner when ANVIL_ROUTING_BANNER=false', async () => {
    const r = await userPromptSubmitHandler(
      mkCtx('debug this null pointer exception', {
        ANVIL_ROUTING_BANNER: 'false',
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
  })

  it('emits the banner by default (no ANVIL_ROUTING_BANNER set)', async () => {
    const r = await userPromptSubmitHandler(
      mkCtx('plan the next sprint features'),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeDefined()
    expect(r.message).toContain('▶')
  })

  // ─── Object-payload regression tests (real Claude Code invocation shape) ────

  it('regression: object payload with prompt field returns exitCode 0', async () => {
    const r = await userPromptSubmitHandler(
      mkCtx({
        prompt: 'hello world',
        session_id: 'x',
        cwd: '/tmp',
        hook_event_name: 'UserPromptSubmit',
      }),
    )
    expect(r.exitCode).toBe(0)
    const ctx = r.context as { promptLength?: number }
    expect(ctx.promptLength).toBe(11)
  })

  it('regression: object payload returns a routing banner message', async () => {
    const r = await userPromptSubmitHandler(
      mkCtx({
        prompt: 'debug the failing tests',
        session_id: 'x',
        cwd: '/tmp',
        hook_event_name: 'UserPromptSubmit',
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeDefined()
    expect(r.message).toContain('▶')
  })

  it('object payload with empty prompt field returns exitCode 1', async () => {
    const r = await userPromptSubmitHandler(mkCtx({ prompt: '' }))
    expect(r.exitCode).toBe(1)
    expect(r.message).toBe('empty prompt detected')
  })

  it('empty object payload (no prompt field) returns exitCode 1', async () => {
    const r = await userPromptSubmitHandler(mkCtx({}))
    expect(r.exitCode).toBe(1)
    expect(r.message).toBe('empty prompt detected')
  })

  it('object payload with whitespace-only prompt returns exitCode 1', async () => {
    const r = await userPromptSubmitHandler(mkCtx({ prompt: '   ' }))
    expect(r.exitCode).toBe(1)
    expect(r.message).toBe('empty prompt detected')
  })
})

// Plan 31 A3+A4 — registry and project ctx wiring
describe('hooks/handlers/user-prompt-submit — Plan 31 A3+A4 registry wiring', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('a4-test')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  const mkCtxWithCwd = (
    prompt: string,
    cwd: string,
    env: Record<string, string> = {},
  ) => ({
    kind: 'user-prompt-submit' as const,
    cwd,
    config: buildDefaultConfig(),
    env,
    payload: prompt,
  })

  it('uses empty Sets when .anvil/registry.json is absent (pre-A3 fallback)', async () => {
    // No registry file — handler should still succeed with empty sets
    const r = await userPromptSubmitHandler(
      mkCtxWithCwd('debug the crash', tmpDir),
    )
    expect(r.exitCode).toBe(0)
    // routingDecision is in context — skill list falls back to intent defaults
    const ctx = r.context as Record<string, unknown>
    const decision = ctx?.routingDecision as { skills: string[] } | undefined
    expect(decision).toBeDefined()
    // default skills preserved when registry is unknown (empty set = keep defaults)
    expect(decision?.skills.length).toBeGreaterThan(0)
  })

  it('passes registry sets to route() when .anvil/registry.json exists (Plan 31 A3)', async () => {
    // Write a registry file with a known skill
    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })
    await writeFile(
      join(anvilDir, 'registry.json'),
      JSON.stringify({
        skills: ['debugging'],
        agents: ['ultra-worker'],
        at: new Date().toISOString(),
      }),
      'utf-8',
    )
    const r = await userPromptSubmitHandler(
      mkCtxWithCwd('debug this crash', tmpDir),
    )
    expect(r.exitCode).toBe(0)
    const ctx = r.context as Record<string, unknown>
    const decision = ctx?.routingDecision as { skills: string[] } | undefined
    // Skills are filtered to the registry — only 'debugging' is registered
    expect(decision?.skills).toEqual(['debugging'])
  })

  it('passes ProjectContext to route() when .anvil/project.json exists (Plan 31 A4)', async () => {
    // Write a project.json file — the router uses it for context signals
    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })
    await writeFile(
      join(anvilDir, 'project.json'),
      JSON.stringify({
        languages: [{ name: 'typescript', confidence: 0.95, evidence: [] }],
        frameworks: [],
        testRunners: [],
        ci: [],
        detectedAt: new Date().toISOString(),
      }),
      'utf-8',
    )
    // Handler should succeed regardless of whether context signals change routing
    const r = await userPromptSubmitHandler(
      mkCtxWithCwd('explore the codebase', tmpDir),
    )
    expect(r.exitCode).toBe(0)
    const ctx = r.context as Record<string, unknown>
    expect(ctx?.routingDecision).toBeDefined()
  })
})

// ─── Plan 31 B4: systemInsert + active-routing.json ──────────────────────────
describe('Plan 31 B4 — systemInsert and active-routing.json', () => {
  let tmpDir: string
  let fakeAnvilHome: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('b4-test')
    fakeAnvilHome = createTestTmpDir('b4-anvil-home')
    process.env.ANVIL_HOME = fakeAnvilHome
  })

  afterEach(async () => {
    // biome-ignore lint/performance/noDelete: process.env.ANVIL_HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    delete process.env.ANVIL_HOME
    await rm(tmpDir, { recursive: true, force: true })
    await rm(fakeAnvilHome, { recursive: true, force: true })
  })

  const mkCtxB4 = (
    prompt: string,
    cwd: string,
    env: Record<string, string> = {},
  ) => ({
    kind: 'user-prompt-submit' as const,
    cwd,
    config: buildDefaultConfig(),
    env,
    payload: prompt,
  })

  it('sets systemInsert and writes active-routing.json for directive-class prompt', async () => {
    // High-confidence directive prompt
    const r = await userPromptSubmitHandler(
      mkCtxB4('debug this null pointer exception', tmpDir),
    )
    expect(r.exitCode).toBe(0)
    // systemInsert must be set for directive prompts
    expect(r.systemInsert).toBeDefined()
    expect(typeof r.systemInsert).toBe('string')
    expect(r.systemInsert).toContain('DIRECTIVE')
    // active-routing.json must be written (per-project path)
    const { readFile } = await import('node:fs/promises')
    const routingPath = await getProjectScopedPath(tmpDir, 'active-routing')
    const raw = await readFile(routingPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      systemInsert: string
      prompt: string
      timestamp: string
    }
    expect(parsed.systemInsert).toBe(r.systemInsert)
    expect(parsed.prompt).toBe('debug this null pointer exception')
    expect(parsed.timestamp).toBeDefined()
  })

  it('does not set systemInsert and does not write active-routing.json for vague prompt', async () => {
    // Vague/multi-intent prompt — should not fire directive
    const r = await userPromptSubmitHandler(
      mkCtxB4(
        'review the bug in the test plan and research alternatives',
        tmpDir,
      ),
    )
    expect(r.exitCode).toBe(0)
    // systemInsert must be absent for non-directive prompts
    expect(r.systemInsert).toBeUndefined()
    // active-routing.json must NOT be written (per-project path)
    const { existsSync } = await import('node:fs')
    const routingPath = await getProjectScopedPath(tmpDir, 'active-routing')
    expect(existsSync(routingPath)).toBe(false)
  })
})

// J4: HookResult shape contract — regression for Plan 33 J1
describe('hooks/handlers/user-prompt-submit — HookResult shape (J4)', () => {
  it('non-directive prompt passes HookResult.parse()', async () => {
    const r = await userPromptSubmitHandler(mkCtx('update the README'))
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('directive prompt (high-confidence) passes HookResult.parse()', async () => {
    // High-confidence directive → sets systemInsert field
    const r = await userPromptSubmitHandler(
      mkCtx('debug this null pointer exception'),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('empty prompt passes HookResult.parse()', async () => {
    const r = await userPromptSubmitHandler(mkCtx(''))
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('object payload (real CC shape) passes HookResult.parse()', async () => {
    const r = await userPromptSubmitHandler(
      mkCtx({
        prompt: 'debug this null pointer exception',
        session_id: 'test',
        cwd: '/tmp',
      }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('regression: after long quiet period, directive prompt must not produce (root): Invalid input', async () => {
    // Simulate the user-reported failure: a directive prompt after session-start
    // emits systemInsert which was the trigger for the CC-side validation error.
    // The HookResult shape itself must be valid regardless of systemInsert presence.
    const highConfidencePrompt =
      'debug the failing null pointer exception in app.ts'
    const r = await userPromptSubmitHandler(mkCtx(highConfidencePrompt))
    // Must not throw — this is the regression guard for Plan 33 J
    expect(() => HookResult.parse(r)).not.toThrow()
    // exitCode must be 0 or 1 (never 2 — handler docs say "never blocks")
    expect([0, 1]).toContain(r.exitCode)
    // systemInsert, if present, must be a string
    if (r.systemInsert !== undefined) {
      expect(typeof r.systemInsert).toBe('string')
    }
  })
})
