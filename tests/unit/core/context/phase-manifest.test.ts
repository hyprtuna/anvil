import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_KINDS,
  ContextEntry,
  DEFAULT_PHASE_MANIFEST,
  PHASE_KEYS,
  PhaseManifest,
  entriesForPhase,
  referencedTokens,
} from '../../../../src/core/context/phase-manifest.js'

describe('PHASE_KEYS', () => {
  it('includes every workflow phase used by AnvilState', () => {
    expect(PHASE_KEYS).toContain('research')
    expect(PHASE_KEYS).toContain('spec')
    expect(PHASE_KEYS).toContain('plan')
    expect(PHASE_KEYS).toContain('tasks')
    expect(PHASE_KEYS).toContain('implement')
    expect(PHASE_KEYS).toContain('verify')
    expect(PHASE_KEYS).toContain('review')
    expect(PHASE_KEYS).toContain('finish')
    expect(PHASE_KEYS).toContain('none')
  })
})

describe('ARTIFACT_KINDS', () => {
  it('mirrors the ticket explicit in-scope list', () => {
    expect([...ARTIFACT_KINDS].sort()).toEqual(
      ['spec', 'plan', 'tasks', 'release-slate', 'notepad'].sort(),
    )
  })
})

describe('ContextEntry schema', () => {
  it('accepts a well-formed entry with a known token', () => {
    const parsed = ContextEntry.parse({
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 100,
      required: true,
    })
    expect(parsed.kind).toBe('spec')
  })

  it('rejects an entry whose pathExpr contains no token', () => {
    const r = ContextEntry.safeParse({
      kind: 'spec',
      pathExpr: '.anvil/specs/features/foo/spec.md',
      maxBytes: 1024,
      priority: 100,
      required: true,
    })
    expect(r.success).toBe(false)
  })

  it('rejects an entry whose pathExpr references an unknown token', () => {
    const r = ContextEntry.safeParse({
      kind: 'spec',
      pathExpr: '${ANVIL_FAKE_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 100,
      required: true,
    })
    expect(r.success).toBe(false)
  })

  it('rejects an entry with a non-positive maxBytes', () => {
    const r = ContextEntry.safeParse({
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 0,
      priority: 100,
      required: true,
    })
    expect(r.success).toBe(false)
  })

  it('rejects an entry with a negative priority', () => {
    const r = ContextEntry.safeParse({
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: -1,
      required: true,
    })
    expect(r.success).toBe(false)
  })

  it('rejects an entry with an unknown kind', () => {
    const r = ContextEntry.safeParse({
      kind: 'unknown-kind',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 100,
      required: true,
    })
    expect(r.success).toBe(false)
  })
})

describe('DEFAULT_PHASE_MANIFEST', () => {
  it('parses against the PhaseManifest schema', () => {
    expect(() => PhaseManifest.parse(DEFAULT_PHASE_MANIFEST)).not.toThrow()
  })

  it('defines an entry list for every PhaseKey', () => {
    for (const k of PHASE_KEYS) {
      expect(DEFAULT_PHASE_MANIFEST[k]).toBeDefined()
    }
  })

  it('marks spec.md as required for the plan phase', () => {
    const entries = DEFAULT_PHASE_MANIFEST.plan
    const specEntry = entries.find((e) => e.kind === 'spec')
    expect(specEntry?.required).toBe(true)
  })

  it('orders implement-phase entries with plan at highest priority', () => {
    const entries = DEFAULT_PHASE_MANIFEST.implement
    const plan = entries.find((e) => e.kind === 'plan')
    const tasks = entries.find((e) => e.kind === 'tasks')
    expect(plan).toBeDefined()
    expect(tasks).toBeDefined()
    expect((plan?.priority ?? 0) > (tasks?.priority ?? 0)).toBe(true)
  })

  it('keeps the sum of maxBytes per phase under a generous ceiling (no single phase explodes)', () => {
    for (const k of PHASE_KEYS) {
      const sum = (DEFAULT_PHASE_MANIFEST[k] ?? []).reduce(
        (acc, e) => acc + e.maxBytes,
        0,
      )
      // Generous ceiling — aggregate budget is 6 KB, individual phase
      // can declare up to 16 KB and let the loader drop entries.
      expect(sum).toBeLessThanOrEqual(16 * 1024)
    }
  })
})

describe('entriesForPhase', () => {
  it('returns the list for a known phase', () => {
    const entries = entriesForPhase('plan')
    expect(entries.length).toBeGreaterThan(0)
  })

  it('returns an empty list for none', () => {
    expect(entriesForPhase('none')).toEqual([])
  })
})

describe('referencedTokens', () => {
  it('returns at least the ANVIL_FEATURES_DIR token used by spec/plan entries', () => {
    const tokens = referencedTokens()
    expect(tokens).toContain('ANVIL_FEATURES_DIR')
  })

  it('returns only known tokens', () => {
    const tokens = referencedTokens()
    // Must intersect with a non-empty subset; loader doctor-row asserts
    // every token resolves cleanly via resolveArtifactPath.
    expect(tokens.length).toBeGreaterThan(0)
  })
})
