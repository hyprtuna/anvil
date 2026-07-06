/**
 * Tests for the rule-reinforcement UserPromptSubmit handler (ANV-0124).
 *
 * Coverage:
 *   1. Cadence-based injection (every N turns).
 *   2. Keyword-based injection.
 *   3. Disable flag (config + env var).
 *   4. Token-budget enforcement.
 *   5. Empty/missing prompts are no-op.
 *   6. Pure helpers (decideInject, matchesKeywordTrigger, buildDigest).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import type { HookKind, ModelsConfig } from '../../../../src/core/types.js'
import {
  DEFAULT_EVERY_N_TURNS,
  DEFAULT_KEYWORD_TRIGGERS,
  _setTurnCounterForTest,
  buildReinforcementDigest,
  decideInject,
  matchesKeywordTrigger,
  ruleReinforcementHandler,
  wrapInEnvelope,
} from '../../../../src/hooks/handlers/rule-reinforcement.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let workDir: string

beforeEach(() => {
  workDir = createTestTmpDir('rule-reinforcement')
  // Initialise as a "project root" so findProjectRoot returns workDir.
  mkdirSync(join(workDir, '.git'), { recursive: true })
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function makeCtx(opts: {
  prompt: string | undefined
  env?: Record<string, string>
  config?: ModelsConfig
}) {
  const cfg = opts.config ?? buildDefaultConfig()
  return {
    kind: 'user-prompt-submit' as HookKind,
    cwd: workDir,
    config: cfg,
    env: opts.env ?? {},
    payload: opts.prompt !== undefined ? { prompt: opts.prompt } : {},
  }
}

function configWith(
  reinforcement: NonNullable<ModelsConfig['reinforcement']>,
): ModelsConfig {
  const cfg = buildDefaultConfig()
  return { ...cfg, reinforcement }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('matchesKeywordTrigger', () => {
  it('returns true when any default trigger appears (case-insensitive)', () => {
    expect(
      matchesKeywordTrigger("Let's Just ship it", DEFAULT_KEYWORD_TRIGGERS),
    ).toBe(true)
    expect(
      matchesKeywordTrigger('Please skip THE tests', DEFAULT_KEYWORD_TRIGGERS),
    ).toBe(true)
  })

  it('returns false when no triggers match', () => {
    expect(matchesKeywordTrigger('hello world', DEFAULT_KEYWORD_TRIGGERS)).toBe(
      false,
    )
  })

  it('returns false for empty/whitespace prompt', () => {
    expect(matchesKeywordTrigger('', DEFAULT_KEYWORD_TRIGGERS)).toBe(false)
    expect(matchesKeywordTrigger('   ', DEFAULT_KEYWORD_TRIGGERS)).toBe(false)
  })

  it('ignores empty-string triggers in the list', () => {
    expect(matchesKeywordTrigger('hello', ['', 'foo'])).toBe(false)
  })
})

describe('decideInject', () => {
  it('returns keyword reason when prompt matches a trigger', () => {
    const d = decideInject({
      prompt: "let's just ship",
      counter: { turns: 1, last_injected_at_turn: 0 },
      everyNTurns: 100,
      triggers: DEFAULT_KEYWORD_TRIGGERS,
    })
    expect(d.inject).toBe(true)
    expect(d.reason).toBe('keyword')
  })

  it('returns cadence reason once N turns have elapsed since last inject', () => {
    const d = decideInject({
      prompt: 'continue work',
      counter: { turns: 20, last_injected_at_turn: 0 },
      everyNTurns: 20,
      triggers: [],
    })
    expect(d.inject).toBe(true)
    expect(d.reason).toBe('cadence')
  })

  it('returns no inject before cadence is reached', () => {
    const d = decideInject({
      prompt: 'normal prompt',
      counter: { turns: 5, last_injected_at_turn: 0 },
      everyNTurns: 20,
      triggers: [],
    })
    expect(d.inject).toBe(false)
    expect(d.reason).toBe('none')
  })

  it('returns no inject on the very first turn (turns === 0 edge)', () => {
    const d = decideInject({
      prompt: 'first',
      counter: { turns: 0, last_injected_at_turn: 0 },
      everyNTurns: 20,
      triggers: [],
    })
    expect(d.inject).toBe(false)
  })
})

describe('buildReinforcementDigest', () => {
  it('emits routing rules and registered skills/agents', () => {
    const digest = buildReinforcementDigest(
      ['debug', 'tdd'],
      ['code-architect'],
    )
    expect(digest).toContain('<routing_rules>')
    expect(digest).toContain('<anvil_skills>debug, tdd</anvil_skills>')
    expect(digest).toContain('<anvil_agents>code-architect</anvil_agents>')
  })

  it('omits empty skill/agent sections when none registered', () => {
    const digest = buildReinforcementDigest([], [])
    expect(digest).not.toContain('<anvil_skills>')
    expect(digest).not.toContain('<anvil_agents>')
    expect(digest).toContain('<routing_rules>')
  })
})

describe('wrapInEnvelope', () => {
  it('wraps body in a grep-friendly <rule-reinforcement> envelope', () => {
    const wrapped = wrapInEnvelope('body')
    expect(wrapped.startsWith('<rule-reinforcement>')).toBe(true)
    expect(wrapped.endsWith('</rule-reinforcement>')).toBe(true)
  })
})

// ─── Handler integration ─────────────────────────────────────────────────────

describe('ruleReinforcementHandler — cadence', () => {
  it('does not inject on a normal early-turn prompt', async () => {
    const r = await ruleReinforcementHandler(
      makeCtx({ prompt: 'do something normal' }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.systemInsert).toBeUndefined()
  })

  it('injects when the configured cadence elapses', async () => {
    // Pre-load the counter so the first invocation immediately satisfies cadence.
    _setTurnCounterForTest(workDir, {
      turns: DEFAULT_EVERY_N_TURNS - 1,
      last_injected_at_turn: 0,
    })
    const r = await ruleReinforcementHandler(
      makeCtx({ prompt: 'continue working' }),
    )
    expect(r.exitCode).toBe(0)
    expect(typeof r.systemInsert).toBe('string')
    expect(r.systemInsert ?? '').toContain('<rule-reinforcement>')
  })

  it('resets the cadence after an injection (does not double-fire)', async () => {
    _setTurnCounterForTest(workDir, {
      turns: DEFAULT_EVERY_N_TURNS - 1,
      last_injected_at_turn: 0,
    })
    const first = await ruleReinforcementHandler(
      makeCtx({ prompt: 'turn one' }),
    )
    expect(first.systemInsert).toBeDefined()
    const second = await ruleReinforcementHandler(
      makeCtx({ prompt: 'turn two' }),
    )
    expect(second.systemInsert).toBeUndefined()
  })
})

describe('ruleReinforcementHandler — keyword triggers', () => {
  it('injects when a default keyword appears', async () => {
    const r = await ruleReinforcementHandler(
      makeCtx({ prompt: "let's just skip review" }),
    )
    expect(r.systemInsert).toBeDefined()
    expect(r.systemInsert ?? '').toContain('<rule-reinforcement>')
  })

  it('honors a custom triggers list', async () => {
    const cfg = configWith({ keyword_triggers: ['banana'] })
    const noMatch = await ruleReinforcementHandler(
      makeCtx({ prompt: "let's just ship", config: cfg }),
    )
    expect(noMatch.systemInsert).toBeUndefined()
    const match = await ruleReinforcementHandler(
      makeCtx({ prompt: 'banana stand', config: cfg }),
    )
    expect(match.systemInsert).toBeDefined()
  })
})

describe('ruleReinforcementHandler — disable flags', () => {
  it('returns no-op when reinforcement.disable=true in config', async () => {
    const cfg = configWith({ disable: true })
    const r = await ruleReinforcementHandler(
      makeCtx({ prompt: "let's just skip review", config: cfg }),
    )
    expect(r.systemInsert).toBeUndefined()
  })

  it('returns no-op when ANVIL_DISABLE_REINFORCEMENT=1 is set', async () => {
    const r = await ruleReinforcementHandler(
      makeCtx({
        prompt: "let's just skip",
        env: { ANVIL_DISABLE_REINFORCEMENT: '1' },
      }),
    )
    expect(r.systemInsert).toBeUndefined()
  })

  it('does not advance the turn counter when env-disabled', async () => {
    // Run several disabled turns; cadence should NOT be tripped on re-enable.
    for (let i = 0; i < 5; i++) {
      await ruleReinforcementHandler(
        makeCtx({
          prompt: 'normal',
          env: { ANVIL_DISABLE_REINFORCEMENT: '1' },
        }),
      )
    }
    expect(
      existsSync(
        join(workDir, '.anvil', 'runtime', 'rule-reinforcement-counter.json'),
      ),
    ).toBe(false)
  })
})

describe('ruleReinforcementHandler — budget enforcement', () => {
  it('clamps the systemInsert body to the configured token budget', async () => {
    // Configure a tiny budget so the digest is clamped.
    const cfg = configWith({
      keyword_triggers: ['inject-now'],
      token_budget: 10, // ~40 chars
    })
    // Seed a registry with many skills/agents so the raw digest exceeds budget.
    const registryDir = join(workDir, '.anvil')
    mkdirSync(registryDir, { recursive: true })
    writeFileSync(
      join(registryDir, 'registry.json'),
      JSON.stringify({
        skills: Array.from({ length: 50 }, (_, i) => `skill-${i}`),
        agents: Array.from({ length: 50 }, (_, i) => `agent-${i}`),
        at: new Date().toISOString(),
      }),
    )

    const r = await ruleReinforcementHandler(
      makeCtx({ prompt: 'inject-now please', config: cfg }),
    )
    expect(r.systemInsert).toBeDefined()
    // The full systemInsert string includes the directive prefix
    // ("[DIRECTIVE:SKILL_REINFORCEMENT]\n") plus the envelope. We check that
    // none of the per-skill names leaks through — proving the body got compacted.
    const body = r.systemInsert ?? ''
    expect(body).not.toContain('skill-49')
    expect(body).not.toContain('agent-49')
  })

  it('emits no body when token_budget is 0', async () => {
    const cfg = configWith({
      keyword_triggers: ['inject-now'],
      token_budget: 0,
    })
    const r = await ruleReinforcementHandler(
      makeCtx({ prompt: 'inject-now please', config: cfg }),
    )
    // The injection still occurs (it was triggered), but the body is empty.
    expect(r.systemInsert).toBeDefined()
    expect(r.systemInsert ?? '').toContain('<rule-reinforcement>')
  })
})

describe('ruleReinforcementHandler — payload handling', () => {
  it('is a no-op when the prompt is empty', async () => {
    const r = await ruleReinforcementHandler(makeCtx({ prompt: '' }))
    expect(r.systemInsert).toBeUndefined()
  })

  it('is a no-op when the payload has no prompt field', async () => {
    const r = await ruleReinforcementHandler(makeCtx({ prompt: undefined }))
    expect(r.systemInsert).toBeUndefined()
  })
})
