import { describe, expect, it } from 'vitest'
import {
  renderRoutingBanner,
  renderRoutingDirective,
} from '../../../src/core/routing-banner.js'
import type { RoutingDecision } from '../../../src/core/types.js'

function stripAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, '')
}

const SAMPLE: RoutingDecision = {
  intent: 'debug',
  confidence: 0.87,
  agent: 'ultra-worker',
  mode: 'single',
  skills: ['debugging', 'silent-failure-hunter'],
  rules: {
    prompt: ['evidence-before-assertion'],
    execution: ['verification-before-completion', 'orchestrator-first'],
    safety: [],
    workflow: [],
  },
  secondaryIntents: [],
  candidates: [],
}

describe('tui/routing-banner (T4.8)', () => {
  it('returns empty string when no decision is available', () => {
    expect(renderRoutingBanner(undefined)).toBe('')
    expect(renderRoutingBanner(null)).toBe('')
  })

  it('renders intent, confidence %, agent, counts', () => {
    const out = stripAnsi(renderRoutingBanner(SAMPLE))
    expect(out).toContain('debug')
    expect(out).toContain('(87%)')
    expect(out).toContain('ultra-worker')
    expect(out).toContain('2 skills')
    // Rule count sums all four buckets (1 prompt + 2 execution).
    expect(out).toContain('3 rules')
  })

  it('shows fallback when present', () => {
    const out = stripAnsi(
      renderRoutingBanner({ ...SAMPLE, fallback: 'generic' }),
    )
    expect(out).toContain('fallback=generic')
  })

  it('renders the ask-mode banner when fallback=ask and candidates are set', () => {
    const out = stripAnsi(
      renderRoutingBanner({
        ...SAMPLE,
        fallback: 'ask',
        candidates: ['debug', 'test'],
      }),
    )
    expect(out).toContain('▶ ambiguous')
    expect(out).toContain('ask')
    expect(out).toContain('candidates: debug, test')
    expect(out).toContain('use /skill to pick')
  })

  it('omits fallback segment when not set', () => {
    const out = stripAnsi(renderRoutingBanner(SAMPLE))
    expect(out).not.toContain('fallback=')
  })

  it('rounds confidence to whole percent', () => {
    const out = stripAnsi(renderRoutingBanner({ ...SAMPLE, confidence: 0.333 }))
    expect(out).toContain('(33%)')
  })

  it('appends +N more when secondaryIntents is non-empty', () => {
    const out = stripAnsi(
      renderRoutingBanner({
        ...SAMPLE,
        secondaryIntents: [
          {
            intent: 'test',
            agent: 'ultra-worker',
            skills: ['test-driven-development'],
            confidence: 0.7,
          },
        ],
      }),
    )
    expect(out).toContain('+1 more')
  })
})

describe('tui/routing-banner — directive mode', () => {
  it('renders a multi-line DIRECTIVE header', () => {
    const out = stripAnsi(renderRoutingDirective(SAMPLE))
    expect(out).toContain('DIRECTIVE')
    expect(out).toContain('route to ultra-worker')
    expect(out).toContain('(debug, 87% confidence)')
    expect(out.split('\n').length).toBeGreaterThan(1)
  })

  it('lists all four rule buckets on a single rules line', () => {
    const out = stripAnsi(renderRoutingDirective(SAMPLE))
    expect(out).toContain('evidence-before-assertion')
    expect(out).toContain('verification-before-completion')
    expect(out).toContain('orchestrator-first')
  })

  it('includes a secondary line when secondaryIntents present', () => {
    const out = stripAnsi(
      renderRoutingDirective({
        ...SAMPLE,
        secondaryIntents: [
          {
            intent: 'test',
            agent: 'ultra-worker',
            skills: ['test-driven-development'],
            confidence: 0.7,
          },
        ],
      }),
    )
    expect(out).toContain('secondary:')
    expect(out).toContain('ultra-worker (test)')
  })

  it('omits skills line when no skills', () => {
    const out = stripAnsi(
      renderRoutingDirective({
        ...SAMPLE,
        skills: [],
      }),
    )
    expect(out).not.toMatch(/skills:\s/)
  })

  it('includes the note line instructing delegation', () => {
    const out = stripAnsi(renderRoutingDirective(SAMPLE))
    expect(out).toContain('delegate to the named agent')
  })
})

// Plan 31 G2 — chain preview in directive banner
describe('routing-banner — G2 chainPreview rendering', () => {
  it('directive with chainPreview renders chain line with → separators', () => {
    const out = stripAnsi(
      renderRoutingDirective({
        ...SAMPLE,
        chainPreview: ['planning', 'debugging', 'code-reviewer'],
      }),
    )
    expect(out).toContain('chain:')
    expect(out).toContain('planning → debugging → code-reviewer')
  })

  it('directive with empty chainPreview does NOT render chain line', () => {
    const out = stripAnsi(
      renderRoutingDirective({
        ...SAMPLE,
        chainPreview: [],
      }),
    )
    expect(out).not.toContain('chain:')
  })
})
