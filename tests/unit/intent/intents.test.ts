import { describe, expect, it } from 'vitest'
import {
  INTENT_DEFINITIONS,
  INTENT_NAMES,
} from '../../../src/intent/intents.js'

describe('intent/intents — canonical 12-intent table', () => {
  it('exports exactly the 12 canonical intents', () => {
    expect(INTENT_NAMES).toHaveLength(12)
    expect(INTENT_NAMES).toEqual(
      expect.arrayContaining([
        'autonomous',
        'explore',
        'review',
        'debug',
        'plan',
        'research',
        'test',
        'mcp',
        'document',
        'refactor',
        'review-respond',
        'install',
      ]),
    )
  })

  it('every definition has a defaultAgent and at least one pattern', () => {
    for (const name of INTENT_NAMES) {
      const def = INTENT_DEFINITIONS[name]
      expect(def.name, name).toBe(name)
      expect(def.defaultAgent.length, `${name} defaultAgent`).toBeGreaterThan(0)
      expect(def.patterns.length, `${name} patterns`).toBeGreaterThan(0)
    }
  })

  it('every pattern has a positive weight', () => {
    for (const name of INTENT_NAMES) {
      for (const p of INTENT_DEFINITIONS[name].patterns) {
        expect(p.weight, `${name} pattern weight`).toBeGreaterThan(0)
      }
    }
  })
})

// Plan 31 A2 — new stickiness keyword pattern coverage
describe('intent/intents — Plan 31 A2 keyword patterns', () => {
  function matchesIntent(
    prompt: string,
    intent: keyof typeof INTENT_DEFINITIONS,
  ): boolean {
    const lower = prompt.toLowerCase()
    return INTENT_DEFINITIONS[intent].patterns.some(({ keyword }) => {
      const re =
        typeof keyword === 'string' ? new RegExp(`\\b${keyword}\\b`) : keyword
      return re.test(lower)
    })
  }

  // autonomous — polish/ship/tighten/tweak
  it('autonomous matches "polish" (stickiness pattern)', () => {
    expect(matchesIntent('polish this feature', 'autonomous')).toBe(true)
  })
  it('autonomous matches "ship" (stickiness pattern)', () => {
    expect(matchesIntent('ship the release', 'autonomous')).toBe(true)
  })
  it('autonomous matches "tighten" (stickiness pattern)', () => {
    expect(matchesIntent('tighten up the types', 'autonomous')).toBe(true)
  })
  it('autonomous matches "tweak" (stickiness pattern)', () => {
    expect(matchesIntent('tweak the config', 'autonomous')).toBe(true)
  })

  // autonomous — make/do it/this better
  it('autonomous matches "make it better" (stickiness pattern)', () => {
    expect(matchesIntent('make it better', 'autonomous')).toBe(true)
  })
  it('autonomous matches "do this better" (stickiness pattern)', () => {
    expect(matchesIntent('do this better', 'autonomous')).toBe(true)
  })

  // autonomous — create endpoint
  it('autonomous matches "create a new api endpoint" (stickiness pattern)', () => {
    expect(matchesIntent('create a new api endpoint', 'autonomous')).toBe(true)
  })
  it('autonomous matches "create an endpoint" (stickiness pattern)', () => {
    expect(matchesIntent('create an endpoint for users', 'autonomous')).toBe(
      true,
    )
  })

  // explore — what does/should/is/are
  it('explore matches "what does this do" (stickiness pattern)', () => {
    expect(matchesIntent('what does this function do', 'explore')).toBe(true)
  })
  it('explore matches "what are the options" (stickiness pattern)', () => {
    expect(matchesIntent('what are the available options', 'explore')).toBe(
      true,
    )
  })

  // explore — how do i/we/you
  it('explore matches "how do i add a feature" (stickiness pattern)', () => {
    expect(matchesIntent('how do i add a feature', 'explore')).toBe(true)
  })
  it('explore matches "how do we deploy" (stickiness pattern)', () => {
    expect(matchesIntent('how do we deploy this', 'explore')).toBe(true)
  })

  // debug — this/that/it is/seems/looks broken
  it('debug matches "this is broken" (stickiness pattern)', () => {
    expect(matchesIntent('this is broken', 'debug')).toBe(true)
  })
  it('debug matches "it looks broken" (stickiness pattern)', () => {
    expect(matchesIntent('it looks broken to me', 'debug')).toBe(true)
  })

  // refactor — speed it/this up
  it('refactor matches "speed it up" (stickiness pattern)', () => {
    expect(matchesIntent('speed it up', 'refactor')).toBe(true)
  })
  it('refactor matches "speed this up" (stickiness pattern)', () => {
    expect(matchesIntent('speed this up', 'refactor')).toBe(true)
  })
})
