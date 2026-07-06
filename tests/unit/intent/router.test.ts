import { describe, expect, it } from 'vitest'
import type { RoutingDecision } from '../../../src/core/types.js'
import { INTENT_DEFINITIONS } from '../../../src/intent/intents.js'
import {
  CONFIDENCE_FLOOR,
  DIRECTIVE_THRESHOLD,
  buildRoutingDecision,
  detectIntents,
  isDirective,
  pickTopIntent,
  resolveRouterThresholds,
  route,
} from '../../../src/intent/router.js'

const ALL_SKILLS = new Set(
  Object.values(INTENT_DEFINITIONS).flatMap((d) => d.defaultSkills),
)
const ALL_AGENTS = new Set(
  Object.values(INTENT_DEFINITIONS).map((d) => d.defaultAgent),
)
const REGISTRY = {
  availableSkills: ALL_SKILLS,
  availableAgents: ALL_AGENTS,
}

describe('intent/router — detectIntents', () => {
  it('picks debug when the prompt mentions debugging a bug', () => {
    const d = detectIntents('debug this bug in the failing test suite')
    expect(d[0].intent).toBe('debug')
  })

  it('scores weighted keywords higher than single keyword', () => {
    const d = detectIntents('I want ultra autonomous mode')
    expect(d[0].intent).toBe('autonomous')
  })

  it('returns empty list when no pattern matches', () => {
    expect(detectIntents('good morning')).toEqual([])
  })

  it('sorts results by score descending', () => {
    const d = detectIntents('review and audit the pr quality')
    expect(d[0].intent).toBe('review')
    for (let i = 1; i < d.length; i++) {
      expect(d[i - 1].score).toBeGreaterThanOrEqual(d[i].score)
    }
  })
})

describe('intent/router — 12 intents × 3 triggers', () => {
  const triggers: Record<string, string[]> = {
    autonomous: [
      'go ultra on this one',
      'just do it autonomously',
      'fully handle the backlog',
    ],
    explore: [
      'explore the codebase',
      'map the architecture',
      'help me understand this architecture',
    ],
    review: [
      'review this PR',
      'audit the code quality',
      'run a code quality review',
    ],
    debug: [
      'debug the failing tests',
      'fix the bug in checkout',
      'this is broken, something is failing',
    ],
    plan: [
      'plan the rollout',
      'break down this feature',
      'architect the new module',
    ],
    research: [
      'research the available options',
      'investigate the outage',
      'analyze and compare the frameworks',
    ],
    test: [
      'write tests for the parser',
      'do tdd on the new endpoint',
      'improve coverage on the core module',
    ],
    mcp: [
      'build an mcp server',
      'wire up model context protocol',
      'add mcp support',
    ],
    document: [
      'write documentation for the module',
      'update the docs',
      'add a readme',
    ],
    refactor: [
      'refactor the billing flow',
      'simplify this code',
      'clean up this mess',
    ],
    'review-respond': [
      'respond to review comments',
      'apply feedback from the PR',
      'address review notes',
    ],
    install: [
      'install anvil here',
      'bootstrap the project with anvil',
      'init anvil in this repo',
    ],
  }

  for (const [intent, phrases] of Object.entries(triggers)) {
    it(`detects ${intent} for its 3 trigger phrases`, () => {
      for (const phrase of phrases) {
        const d = detectIntents(phrase)
        expect(d[0]?.intent, `phrase="${phrase}"`).toBe(intent)
      }
    })
  }
})

describe('intent/router — pickTopIntent', () => {
  it('returns fallback main when nothing detected', () => {
    const picked = pickTopIntent([])
    expect(picked.fallback).toBe('main')
  })

  it('falls back to generic when confidence < CONFIDENCE_FLOOR', () => {
    // Synthesize a tied distribution across 6 intents so confidence is below
    // the 0.25 floor under the Plan 31 A5 formula:
    //   numerator = 1 + 0.3*1 = 1.3; denominator = 1+1+4 = 6; conf ≈ 0.217
    const detected = [
      { intent: 'debug', score: 1, matchedKeywords: [] },
      { intent: 'review', score: 1, matchedKeywords: [] },
      { intent: 'plan', score: 1, matchedKeywords: [] },
      { intent: 'explore', score: 1, matchedKeywords: [] },
      { intent: 'research', score: 1, matchedKeywords: [] },
      { intent: 'test', score: 1, matchedKeywords: [] },
    ] as const
    const picked = pickTopIntent([...detected])
    expect(picked.confidence).toBeLessThan(CONFIDENCE_FLOOR)
    expect(picked.fallback).toBe('generic')
  })

  it('does not fall back when one intent dominates', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: [] },
      { intent: 'review', score: 1, matchedKeywords: [] },
    ])
    expect(picked.fallback).toBeUndefined()
    expect(picked.confidence).toBeGreaterThan(0.5)
  })
})

describe('intent/router — buildRoutingDecision', () => {
  it('filters skills to only those registered', () => {
    const decision = buildRoutingDecision(
      { intent: 'debug', confidence: 0.9 },
      new Set(['debugging']),
      new Set(['ultra-worker']),
    )
    expect(decision.skills).toEqual(['debugging'])
    expect(decision.agent).toBe('ultra-worker')
  })

  it('propagates fallback into the decision', () => {
    const decision = buildRoutingDecision(
      { intent: 'debug', confidence: 0.1, fallback: 'generic' },
      ALL_SKILLS,
      ALL_AGENTS,
    )
    expect(decision.fallback).toBe('generic')
  })

  it('attaches applicableRules for the picked intent into rules.prompt', () => {
    const decision = buildRoutingDecision(
      { intent: 'debug', confidence: 0.9 },
      ALL_SKILLS,
      ALL_AGENTS,
    )
    expect(decision.rules.prompt).toEqual(
      INTENT_DEFINITIONS.debug.applicableRules,
    )
  })

  it('populates execution rule bucket when executionRules are defined', () => {
    const decision = buildRoutingDecision(
      { intent: 'debug', confidence: 0.9 },
      ALL_SKILLS,
      ALL_AGENTS,
    )
    expect(decision.rules.execution).toContain('verification-before-completion')
    expect(decision.rules.execution).toContain('orchestrator-first')
  })

  it('populates workflow rule bucket for test intent (tdd-iron-law)', () => {
    const decision = buildRoutingDecision(
      { intent: 'test', confidence: 0.9 },
      ALL_SKILLS,
      ALL_AGENTS,
    )
    expect(decision.rules.workflow).toContain('tdd-iron-law')
  })

  it('leaves unused rule buckets empty (arrays, not undefined)', () => {
    const decision = buildRoutingDecision(
      { intent: 'document', confidence: 0.9 },
      ALL_SKILLS,
      ALL_AGENTS,
    )
    expect(decision.rules.execution).toEqual([])
    expect(decision.rules.safety).toEqual([])
    expect(decision.rules.workflow).toEqual([])
  })

  it('initializes secondaryIntents and candidates to empty arrays', () => {
    const decision = buildRoutingDecision(
      { intent: 'debug', confidence: 0.9 },
      ALL_SKILLS,
      ALL_AGENTS,
    )
    expect(decision.secondaryIntents).toEqual([])
    expect(decision.candidates).toEqual([])
  })
})

describe('intent/router — pickTopIntent ask + multi-intent', () => {
  it('returns fallback ask when top two scores are within 5%', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: [] },
      { intent: 'test', score: 10, matchedKeywords: [] },
    ])
    expect(picked.fallback).toBe('ask')
    expect(picked.candidates).toEqual(['debug', 'test'])
  })

  it('does not fall back to ask when confidence is below floor (generic wins)', () => {
    // 6 tied intents: Plan 31 A5 formula gives confidence ≈ 0.217 < 0.25 floor
    // — generic fires before ask check.
    const picked = pickTopIntent([
      { intent: 'debug', score: 1, matchedKeywords: [] },
      { intent: 'review', score: 1, matchedKeywords: [] },
      { intent: 'plan', score: 1, matchedKeywords: [] },
      { intent: 'explore', score: 1, matchedKeywords: [] },
      { intent: 'research', score: 1, matchedKeywords: [] },
      { intent: 'test', score: 1, matchedKeywords: [] },
    ])
    expect(picked.fallback).toBe('generic')
  })

  it('attaches secondary when runner-up ≥ 60% of top', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: [] },
      { intent: 'test', score: 7, matchedKeywords: [] },
    ])
    expect(picked.fallback).toBeUndefined()
    expect(picked.secondary?.intent).toBe('test')
  })

  it('drops secondary when runner-up < 60% of top', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: [] },
      { intent: 'test', score: 3, matchedKeywords: [] },
    ])
    expect(picked.secondary).toBeUndefined()
  })
})

describe('intent/router — multi-intent in RoutingDecision', () => {
  it('populates secondaryIntents and sets mode=parallel for multi-intent', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: [] },
      { intent: 'test', score: 7, matchedKeywords: [] },
    ])
    const decision = buildRoutingDecision(picked, ALL_SKILLS, ALL_AGENTS)
    expect(decision.mode).toBe('parallel')
    expect(decision.secondaryIntents).toHaveLength(1)
    expect(decision.secondaryIntents[0].intent).toBe('test')
    expect(decision.secondaryIntents[0].skills).toContain(
      'test-driven-development',
    )
  })

  it('populates candidates and leaves mode=single for ask-mode', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: [] },
      { intent: 'test', score: 10, matchedKeywords: [] },
    ])
    const decision = buildRoutingDecision(picked, ALL_SKILLS, ALL_AGENTS)
    expect(decision.fallback).toBe('ask')
    expect(decision.candidates).toEqual(['debug', 'test'])
    expect(decision.mode).toBe('single')
    expect(decision.secondaryIntents).toEqual([])
  })
})

describe('intent/router — negative patterns', () => {
  it('vetoes debug when "not a bug" appears', () => {
    const d = detectIntents(
      'this error is not a bug, it is working as intended',
    )
    const debug = d.find((x) => x.intent === 'debug')
    expect(debug).toBeUndefined()
  })

  it('vetoes refactor when "don\'t refactor" appears', () => {
    const d = detectIntents("simplify the billing flow but don't refactor it")
    const refactor = d.find((x) => x.intent === 'refactor')
    expect(refactor).toBeUndefined()
  })

  it('vetoes test when "without tests" appears', () => {
    const d = detectIntents('ship the feature without tests for now')
    const test = d.find((x) => x.intent === 'test')
    expect(test).toBeUndefined()
  })

  it('leaves intent intact when no negative pattern matches', () => {
    const d = detectIntents('debug the failing test suite')
    expect(d[0].intent).toBe('debug')
  })
})

describe('intent/router — isDirective', () => {
  const base: RoutingDecision = {
    intent: 'debug',
    confidence: 0.9,
    agent: 'ultra-worker',
    mode: 'single',
    skills: ['debugging'],
    rules: { prompt: [], execution: [], safety: [], workflow: [] },
    secondaryIntents: [],
    candidates: [],
  }

  it('returns true at or above DIRECTIVE_THRESHOLD with a specialist agent', () => {
    expect(isDirective({ ...base, confidence: DIRECTIVE_THRESHOLD })).toBe(true)
    expect(isDirective({ ...base, confidence: 0.9 })).toBe(true)
  })

  it('returns false below DIRECTIVE_THRESHOLD', () => {
    expect(
      isDirective({ ...base, confidence: DIRECTIVE_THRESHOLD - 0.01 }),
    ).toBe(false)
    expect(isDirective({ ...base, confidence: 0.5 })).toBe(false)
  })

  it('returns false when agent is main', () => {
    expect(isDirective({ ...base, confidence: 0.99, agent: 'main' })).toBe(
      false,
    )
  })

  it('returns false when any fallback is set', () => {
    expect(
      isDirective({ ...base, confidence: 0.99, fallback: 'generic' }),
    ).toBe(false)
    expect(isDirective({ ...base, confidence: 0.99, fallback: 'ask' })).toBe(
      false,
    )
  })
})

describe('intent/router — route()', () => {
  it('wires prompt → top intent → routing decision', () => {
    const decision = route('debug the failing tests', REGISTRY)
    expect(decision.intent).toBe('debug')
    expect(decision.agent).toBe('ultra-worker')
    expect(decision.skills).toContain('debugging')
    // verification-before-completion is an execution-category rule.
    expect(decision.rules.execution).toContain('verification-before-completion')
  })

  it('returns main fallback for unrecognized prompts', () => {
    const decision = route('good morning', REGISTRY)
    expect(decision.fallback).toBe('main')
  })

  it('always produces a valid confidence in [0, 1]', () => {
    for (const prompt of [
      'debug the tests',
      'plan the release',
      'good morning',
      'do review and audit and plan',
    ]) {
      const decision = route(prompt, REGISTRY)
      expect(decision.confidence).toBeGreaterThanOrEqual(0)
      expect(decision.confidence).toBeLessThanOrEqual(1)
    }
  })
})

describe('intent/router — A6 threshold overrides via models.json', () => {
  it('resolveRouterThresholds returns defaults when config absent', async () => {
    const { resolveRouterThresholds, DEFAULT_ROUTER_THRESHOLDS } = await import(
      '../../../src/intent/router.js'
    )
    expect(resolveRouterThresholds()).toEqual(DEFAULT_ROUTER_THRESHOLDS)
  })

  it('overrides apply per-key; missing keys keep their default', async () => {
    const { buildDefaultConfig } = await import(
      '../../../src/core/config/defaults.js'
    )
    const { resolveRouterThresholds, DEFAULT_ROUTER_THRESHOLDS } = await import(
      '../../../src/intent/router.js'
    )
    const cfg = buildDefaultConfig()
    const override = {
      ...cfg,
      router: { thresholds: { directive_threshold: 0.9 } },
    }
    const t = resolveRouterThresholds(override)
    expect(t.directive_threshold).toBe(0.9)
    expect(t.confidence_floor).toBe(DEFAULT_ROUTER_THRESHOLDS.confidence_floor)
  })

  it('pickTopIntent honors a custom confidence_floor', async () => {
    const { pickTopIntent } = await import('../../../src/intent/router.js')
    const detected = [
      { intent: 'debug' as const, score: 1, matchedKeywords: ['debug'] },
      { intent: 'test' as const, score: 1.5, matchedKeywords: ['tests'] },
      { intent: 'plan' as const, score: 1.6, matchedKeywords: ['plan'] },
    ]
    const strict = pickTopIntent(detected, {
      ask_tie_tolerance: 0.05,
      multi_intent_threshold: 0.6,
      confidence_floor: 0.9,
      directive_threshold: 0.75,
    })
    expect(strict.fallback).toBe('generic')
  })

  it('isDirective honors a custom directive_threshold', async () => {
    const { isDirective } = await import('../../../src/intent/router.js')
    // confidence 0.6 is below the new default threshold of 0.65 → false
    const decision = {
      intent: 'debug' as const,
      confidence: 0.6,
      agent: 'debugging',
      mode: 'single' as const,
      skills: [],
      rules: { prompt: [], execution: [], safety: [], workflow: [] },
    }
    expect(isDirective(decision)).toBe(false)
    expect(
      isDirective(decision, {
        ask_tie_tolerance: 0.05,
        multi_intent_threshold: 0.6,
        confidence_floor: 0.25,
        directive_threshold: 0.55,
      }),
    ).toBe(true)
  })

  it('rejects out-of-range threshold values via Zod', async () => {
    const { ModelsConfig } = await import('../../../src/core/types.js')
    const { buildDefaultConfig } = await import(
      '../../../src/core/config/defaults.js'
    )
    const cfg = buildDefaultConfig()
    expect(() =>
      ModelsConfig.parse({
        ...cfg,
        router: { thresholds: { directive_threshold: 1.5 } },
      }),
    ).toThrow()
    expect(() =>
      ModelsConfig.parse({
        ...cfg,
        router: { thresholds: { confidence_floor: -0.1 } },
      }),
    ).toThrow()
  })

  it('DEFAULT_ROUTER_THRESHOLDS.directive_threshold is 0.65 (Plan 31 A1)', async () => {
    const { DEFAULT_ROUTER_THRESHOLDS } = await import(
      '../../../src/intent/router.js'
    )
    expect(DEFAULT_ROUTER_THRESHOLDS.directive_threshold).toBe(0.65)
  })
})

// Plan 31 A5 — multi-intent confidence reweighting
describe('intent/router — Plan 31 A5 multi-intent confidence formula', () => {
  it('strong primary alone → high confidence (>0.65)', () => {
    // Only one intent detected — denominator equals numerator
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: ['debug'] },
    ])
    expect(picked.confidence).toBeGreaterThan(0.65)
  })

  it('strong primary + weak secondary → high confidence (>0.65)', () => {
    // top=10, secondary=1 — the 0.3 weight keeps confidence high
    // numerator=10+0.3=10.3; denominator=10+1+0=11; conf≈0.936
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: ['debug'] },
      { intent: 'test', score: 1, matchedKeywords: ['test'] },
    ])
    expect(picked.confidence).toBeGreaterThan(0.65)
  })

  it('two roughly equal intents → mid confidence (below strong-primary case)', () => {
    // top=5, secondary=4, total=9
    // numerator=5+0.3*4=6.2; denominator=5+4+0=9; conf≈0.689
    const picked = pickTopIntent([
      { intent: 'debug', score: 5, matchedKeywords: ['debug'] },
      { intent: 'review', score: 4, matchedKeywords: ['review'] },
    ])
    // Should be less than the case of a strong dominant primary
    expect(picked.confidence).toBeLessThan(0.95)
    expect(picked.confidence).toBeGreaterThan(0.3)
  })

  it('flat distribution (3+ intents close) → low confidence (<0.65)', () => {
    // top=4, secondary=4, others=4; total=12
    // numerator=4+0.3*4=5.2; denominator=4+4+4=12; conf≈0.433
    const picked = pickTopIntent([
      { intent: 'debug', score: 4, matchedKeywords: [] },
      { intent: 'review', score: 4, matchedKeywords: [] },
      { intent: 'plan', score: 4, matchedKeywords: [] },
    ])
    expect(picked.confidence).toBeLessThan(0.65)
  })
})

// Plan 31 A6 — ANVIL_DIRECTIVE_THRESHOLD env var override
describe('intent/router — Plan 31 A6 env var threshold override', () => {
  // resolveRouterThresholds reads process.env at call time so we can set/restore inline.

  it('env var set to valid float overrides default directive_threshold', () => {
    const orig = process.env.ANVIL_DIRECTIVE_THRESHOLD
    try {
      process.env.ANVIL_DIRECTIVE_THRESHOLD = '0.80'
      const t = resolveRouterThresholds(undefined)
      expect(t.directive_threshold).toBe(0.8)
    } finally {
      // Restore: empty string is treated as "not set" by the guard in resolveRouterThresholds
      process.env.ANVIL_DIRECTIVE_THRESHOLD = orig ?? ''
    }
  })

  it('env var value below 0.25 is clamped to 0.25', () => {
    const orig = process.env.ANVIL_DIRECTIVE_THRESHOLD
    try {
      process.env.ANVIL_DIRECTIVE_THRESHOLD = '0.10'
      const t = resolveRouterThresholds(undefined)
      expect(t.directive_threshold).toBe(0.25)
    } finally {
      process.env.ANVIL_DIRECTIVE_THRESHOLD = orig ?? ''
    }
  })

  it('env var unset + models.json override → uses models.json value', async () => {
    const orig = process.env.ANVIL_DIRECTIVE_THRESHOLD
    try {
      // Set to empty string so the function's `envRaw !== ''` guard skips it
      process.env.ANVIL_DIRECTIVE_THRESHOLD = ''
      const { buildDefaultConfig } = await import(
        '../../../src/core/config/defaults.js'
      )
      const cfg = buildDefaultConfig()
      const withOverride = {
        ...cfg,
        router: { thresholds: { directive_threshold: 0.72 } },
      }
      const t = resolveRouterThresholds(withOverride)
      expect(t.directive_threshold).toBe(0.72)
    } finally {
      process.env.ANVIL_DIRECTIVE_THRESHOLD = orig ?? ''
    }
  })
})

// Plan 31 G1 — chainPreview on RoutingDecision
describe('intent/router — G1 chainPreview', () => {
  function makeSkill(
    name: string,
    chains: Array<{ before?: string; after?: string }> = [],
  ) {
    return {
      frontmatter: {
        name,
        kind: 'atomic' as const,
        group: 'test',
        description: `${name} skill`,
        trigger: [],
        preferred_model: 'claude-sonnet-4-5',
        preferred_effort: 'medium' as const,
        inputs: [],
        outputs: [],
        tools: [],
        chains,
        language: 'universal',
        tags: [],
        aliases: [],
        isHidden: false,
        'user-invocable': true,
        'disable-model-invocation': false,
        userInvocable: true,
        disableModelInvocation: false,
        argumentHint: undefined,
        allowedTools: undefined,
        breaking_changes_in: [],
      },
      body: '',
      sourcePath: `/skills/${name}.md`,
      tier: 'universal' as const,
    }
  }

  it('skill with no chain returns empty chainPreview', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: ['debug'] },
    ])
    const debugSkillName = INTENT_DEFINITIONS.debug.defaultSkills[0]
    const skillObj = makeSkill(debugSkillName ?? 'debugging', [])
    const decision = buildRoutingDecision(
      picked,
      new Set([skillObj.frontmatter.name]),
      ALL_AGENTS,
      [skillObj],
    )
    expect(decision.chainPreview).toEqual([])
  })

  it('skill with before:verification chain includes verification ahead of main skill', () => {
    const picked = pickTopIntent([
      { intent: 'debug', score: 10, matchedKeywords: ['debug'] },
    ])
    const mainSkillName = 'debugging'
    const verificationSkillName = 'plan-verifier'
    // mainSkill chains: [{ before: verificationSkillName }] → verification runs after main
    const mainSkill = makeSkill(mainSkillName, [
      { before: verificationSkillName },
    ])
    const verificationSkill = makeSkill(verificationSkillName, [])
    const decision = buildRoutingDecision(
      picked,
      new Set([mainSkillName, verificationSkillName]),
      ALL_AGENTS,
      [mainSkill, verificationSkill],
    )
    // composeChain: mainSkill → before:verification → chain is [mainSkillName, verificationSkillName]
    expect(decision.chainPreview.length).toBeGreaterThan(1)
    expect(decision.chainPreview).toContain(verificationSkillName)
  })
})

// Plan 31 H1 — directive_threshold boundary tests
describe('intent/router — H1 directive_threshold boundary', () => {
  /**
   * Helper: synthesize a RoutingDecision with the given confidence and force
   * a specialist agent so the only variable is the threshold comparison.
   */
  function makeDecision(
    confidence: number,
  ): import('../../../src/core/types.js').RoutingDecision {
    return {
      intent: 'debug',
      confidence,
      agent: 'ultra-worker',
      mode: 'single',
      skills: ['debugging'],
      rules: { prompt: [], execution: [], safety: [], workflow: [] },
      secondaryIntents: [],
      candidates: [],
      chainPreview: [],
    }
  }

  it('confidence 0.64 is NOT a directive at default threshold 0.65', () => {
    expect(isDirective(makeDecision(0.64))).toBe(false)
  })

  it('confidence 0.65 IS a directive at default threshold 0.65 (>= comparison)', () => {
    expect(isDirective(makeDecision(0.65))).toBe(true)
  })

  it('confidence 0.66 IS a directive at default threshold 0.65', () => {
    expect(isDirective(makeDecision(0.66))).toBe(true)
  })

  it('ANVIL_DIRECTIVE_THRESHOLD=0.50 env override: 0.55-confidence prompt is a directive', () => {
    const orig = process.env.ANVIL_DIRECTIVE_THRESHOLD
    try {
      process.env.ANVIL_DIRECTIVE_THRESHOLD = '0.50'
      const thresholds = resolveRouterThresholds(undefined)
      expect(thresholds.directive_threshold).toBe(0.5)
      expect(isDirective(makeDecision(0.55), thresholds)).toBe(true)
    } finally {
      process.env.ANVIL_DIRECTIVE_THRESHOLD = orig ?? ''
    }
  })

  it('models.json directive_threshold=0.80: 0.70-confidence is NOT a directive', async () => {
    const orig = process.env.ANVIL_DIRECTIVE_THRESHOLD
    try {
      // Clear env so only the models.json override applies
      process.env.ANVIL_DIRECTIVE_THRESHOLD = ''
      const { buildDefaultConfig } = await import(
        '../../../src/core/config/defaults.js'
      )
      const cfg = buildDefaultConfig()
      const withOverride = {
        ...cfg,
        router: { thresholds: { directive_threshold: 0.8 } },
      }
      const thresholds = resolveRouterThresholds(withOverride)
      expect(thresholds.directive_threshold).toBe(0.8)
      expect(isDirective(makeDecision(0.7), thresholds)).toBe(false)
    } finally {
      process.env.ANVIL_DIRECTIVE_THRESHOLD = orig ?? ''
    }
  })
})
