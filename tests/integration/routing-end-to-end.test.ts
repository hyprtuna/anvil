/**
 * Table-driven end-to-end routing tests.
 *
 * These tests lock in the desired routing behaviour for canonical prompt
 * fixtures. Assertions are strict — intent, agent, and skill presence are
 * all verified. Any regression in intent weights or selector scoring will
 * surface here immediately.
 */

import { describe, expect, it } from 'vitest'
import {
  buildRoutingDecision,
  detectIntents,
  pickTopIntent,
} from '../../src/intent/router.js'

/** Run the full pipeline for a prompt, returning decision + detected intents. */
function runRoute(prompt: string) {
  const detected = detectIntents(prompt)
  const picked = pickTopIntent(detected)
  const decision = buildRoutingDecision(picked, new Set(), new Set())
  return { detected, picked, decision }
}

/**
 * Returns true if the string array contains a value matching the predicate.
 */
function anyMatches(arr: string[], pred: (s: string) => boolean): boolean {
  return arr.some(pred)
}

describe('integration: routing end-to-end', () => {
  it('plan a feature → intent=plan, skills include plan-writing or brainstorming', () => {
    const { decision } = runRoute('plan a feature to add OAuth login')
    expect(decision.intent).toBe('plan')
    const hasPlanner = anyMatches(
      decision.skills,
      (s) => s.includes('plan') || s.includes('brainstorm'),
    )
    expect(hasPlanner).toBe(true)
  })

  it('debug null pointer → intent=debug, skills include debugging', () => {
    const { decision } = runRoute('debug this null pointer exception')
    expect(decision.intent).toBe('debug')
    const hasDebugger = anyMatches(decision.skills, (s) => s.includes('debug'))
    expect(hasDebugger).toBe(true)
  })

  it('review PR for security → intent=review, agent=code-reviewer or security-auditing', () => {
    const { decision } = runRoute('review this PR for security issues')
    expect(decision.intent).toBe('review')
    expect(decision.agent).toBe('code-reviewer')
    expect(
      anyMatches(
        decision.skills,
        (s) => s.includes('review') || s.includes('security'),
      ),
    ).toBe(true)
  })

  it('write tests for auth module → intent=test, skills include test-driven-development', () => {
    const { decision } = runRoute('write tests for the auth module')
    expect(decision.intent).toBe('test')
    expect(
      anyMatches(
        decision.skills,
        (s) => s.includes('tdd') || s.includes('test'),
      ),
    ).toBe(true)
  })

  it('explain how this function works → intent=explore, agent=code-explorer', () => {
    const { decision } = runRoute('explain how this function works')
    expect(decision.intent).toBe('explore')
    expect(decision.agent).toBe('code-explorer')
  })

  it('refactor this messy function → intent=refactor, skills include code-simplifier or slop-removal', () => {
    const { decision } = runRoute('refactor this messy function')
    expect(decision.intent).toBe('refactor')
    expect(decision.agent).toBe('code-simplifier')
    expect(
      anyMatches(
        decision.skills,
        (s) =>
          s.includes('simplif') || s.includes('slop') || s.includes('refactor'),
      ),
    ).toBe(true)
  })

  it('ambiguous "fix this" → non-empty result, no crash', () => {
    const { decision } = runRoute('fix this')
    // Should return a valid RoutingDecision even for minimal prompts
    expect(typeof decision.intent).toBe('string')
    expect(decision.intent.length).toBeGreaterThan(0)
    expect(typeof decision.agent).toBe('string')
  })
})
