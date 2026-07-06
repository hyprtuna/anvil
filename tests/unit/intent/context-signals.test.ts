import { describe, expect, it } from 'vitest'
import type { ProjectContext } from '../../../src/core/types.js'
import { computeIntentDeltas } from '../../../src/intent/context-signals.js'
import { applyContextSignals } from '../../../src/intent/router.js'

function mkCtx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    languages: [],
    frameworks: [],
    testRunners: [],
    packageManager: undefined,
    ci: [],
    detectedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('intent/context-signals — computeIntentDeltas', () => {
  it('returns {} when ctx is undefined', () => {
    expect(computeIntentDeltas('debug the failing test', undefined)).toEqual({})
  })

  it('returns {} when ctx has no signals that match the prompt', () => {
    expect(computeIntentDeltas('hello there', mkCtx())).toEqual({})
  })

  it('boosts test + debug when test runner is installed and prompt names a test file', () => {
    const ctx = mkCtx({ testRunners: ['vitest'] })
    const deltas = computeIntentDeltas('fix the flaky foo.test.ts', ctx)
    expect(deltas.test).toBe(2)
    expect(deltas.debug).toBe(1)
  })

  it('does not boost test when runner is missing even if path matches', () => {
    const ctx = mkCtx({ testRunners: [] })
    const deltas = computeIntentDeltas('fix the flaky foo.test.ts', ctx)
    expect(deltas.test).toBeUndefined()
  })

  it('boosts refactor + debug when TS is top language and prompt mentions type words', () => {
    const ctx = mkCtx({
      languages: [{ name: 'TypeScript', confidence: 0.9, evidence: [] }],
    })
    const deltas = computeIntentDeltas(
      'tighten the generic in the Result interface',
      ctx,
    )
    expect(deltas.refactor).toBe(1)
    expect(deltas.debug).toBe(1)
  })

  it('boosts explore + refactor when a UI framework is present and prompt mentions UI words', () => {
    const ctx = mkCtx({ frameworks: ['React'] })
    const deltas = computeIntentDeltas(
      'refresh the header component on every page',
      ctx,
    )
    expect(deltas.explore).toBe(1)
    expect(deltas.refactor).toBe(1)
  })

  it('boosts plan + review when a release CI workflow exists and release words appear', () => {
    const ctx = mkCtx({ ci: ['release.yml'] })
    const deltas = computeIntentDeltas(
      'prepare to cut a release and ship the backlog',
      ctx,
    )
    expect(deltas.plan).toBe(1)
    expect(deltas.review).toBe(1)
  })
})

describe('intent/router — applyContextSignals', () => {
  it('leaves detected list unchanged when ctx is undefined', () => {
    const input = [{ intent: 'debug' as const, score: 3, matchedKeywords: [] }]
    const out = applyContextSignals('fix foo.test.ts', input, undefined)
    expect(out).toEqual(input)
  })

  it('adds signal-only intents that did not match any keyword', () => {
    const input = [{ intent: 'debug' as const, score: 2, matchedKeywords: [] }]
    const ctx = mkCtx({ testRunners: ['vitest'] })
    const out = applyContextSignals('touch foo.test.ts again', input, ctx)
    const test = out.find((d) => d.intent === 'test')
    expect(test?.score).toBe(2)
  })

  it('boosts existing intents instead of duplicating', () => {
    const input = [
      { intent: 'test' as const, score: 3, matchedKeywords: ['test'] },
    ]
    const ctx = mkCtx({ testRunners: ['vitest'] })
    const out = applyContextSignals('check foo.test.ts', input, ctx)
    const test = out.find((d) => d.intent === 'test')
    expect(test?.score).toBe(5) // 3 + 2 boost
    expect(out.filter((d) => d.intent === 'test')).toHaveLength(1)
  })
})
