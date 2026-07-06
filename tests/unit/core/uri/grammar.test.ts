import { describe, expect, it } from 'vitest'
import { BUNDLED_PACK } from '../../../../src/core/uri/filesystem-map.js'
import { canonicalise } from '../../../../src/core/uri/format.js'
import {
  MAX_URI_LENGTH,
  parseGrammar,
} from '../../../../src/core/uri/grammar.js'
import type { ResourceKind } from '../../../../src/core/uri/types.js'

describe('core/uri/grammar — parseGrammar', () => {
  it('parses every valid example from RFC §2.2', () => {
    const cases: Array<{
      uri: string
      kind: ResourceKind
      slug: string
      pack?: string
      version?: string
      fragment?: string
    }> = [
      { uri: 'anvil:skill/code-review', kind: 'skill', slug: 'code-review' },
      {
        uri: 'anvil:agent/code-architect',
        kind: 'agent',
        slug: 'code-architect',
      },
      { uri: 'anvil:hook/session-start', kind: 'hook', slug: 'session-start' },
      { uri: 'anvil:command/init', kind: 'command', slug: 'init' },
      { uri: 'anvil:slash/skill-run', kind: 'slash', slug: 'skill-run' },
      { uri: 'anvil:plan/v0.15.6', kind: 'plan', slug: 'v0.15.6' },
      { uri: 'anvil:ticket/ANV-0095', kind: 'ticket', slug: 'ANV-0095' },
      {
        uri: 'anvil:myteam:skill/code-review',
        kind: 'skill',
        slug: 'code-review',
        pack: 'myteam',
      },
      {
        uri: 'anvil:skill/code-review#step-3',
        kind: 'skill',
        slug: 'code-review',
        fragment: 'step-3',
      },
    ]
    for (const c of cases) {
      const got = parseGrammar(c.uri)
      expect(got, `parse ${c.uri}`).not.toBeNull()
      expect(got?.kind).toBe(c.kind)
      expect(got?.slug).toBe(c.slug)
      expect(got?.pack).toBe(c.pack)
      expect(got?.fragment).toBe(c.fragment)
    }
  })

  it('parses shorthand form with kind = undefined', () => {
    const got = parseGrammar('anvil:code-review')
    expect(got).not.toBeNull()
    expect(got?.kind).toBeUndefined()
    expect(got?.slug).toBe('code-review')
    expect(got?.pack).toBeUndefined()
  })

  it('rejects the six invalid cases in RFC §8.1', () => {
    const invalid = [
      'anvil:', // empty
      'anvil:skill/', // empty slug
      'anvil:Skill/x', // uppercase kind
      'anvil:skill/Code-Review', // uppercase slug
      'anvil:skill/x/y/z', // extra segments
      'anvil:skill/../etc/passwd', // traversal — stopped by slug regex
    ]
    for (const uri of invalid) {
      expect(parseGrammar(uri), `should reject ${uri}`).toBeNull()
    }
  })

  it('rejects non-anvil URIs and non-strings', () => {
    expect(parseGrammar('foo:skill/bar')).toBeNull()
    expect(parseGrammar('')).toBeNull()
    expect(parseGrammar('https://example.com')).toBeNull()
    // @ts-expect-error — runtime guard
    expect(parseGrammar(null)).toBeNull()
  })

  it('rejects URIs over the length cap (DoS guard, RFC §6.4)', () => {
    const huge = `anvil:skill/${'a'.repeat(MAX_URI_LENGTH)}`
    expect(parseGrammar(huge)).toBeNull()
  })

  it('rejects plan slug that is not semver-shaped', () => {
    expect(parseGrammar('anvil:plan/not-a-version')).toBeNull()
  })

  it('rejects ticket slug that is not ANV-NNNN', () => {
    expect(parseGrammar('anvil:ticket/bug-123')).toBeNull()
    expect(parseGrammar('anvil:ticket/ANV-95')).toBeNull()
  })

  it('round-trips canonical inputs (canonicalise ∘ parse identity)', () => {
    const inputs = [
      'anvil:skill/code-review',
      'anvil:agent/code-architect',
      'anvil:myteam:skill/code-review',
      'anvil:plan/v0.15.6',
      'anvil:ticket/ANV-0095',
      'anvil:skill/code-review#step-3',
    ]
    for (const uri of inputs) {
      const parsed = parseGrammar(uri)!
      const ref = {
        uri: '',
        kind: parsed.kind!,
        slug: parsed.slug,
        pack: parsed.pack ?? BUNDLED_PACK,
        version: parsed.version,
        fragment: parsed.fragment,
        fsPath: '/tmp/fake',
      }
      expect(canonicalise(ref)).toBe(uri)
    }
  })
})
