import { describe, expect, it } from 'vitest'
import { computeSkillProvenanceObjectLint } from '../../../../src/commands/cli/doctor.js'

/**
 * ANV-0058 — `Skill provenance object` doctor lint.
 *
 * Unit tests for the pure `computeSkillProvenanceObjectLint` function.
 * Covers: generatedBy+lastUpdated rule, zero-coverage advisory, happy paths.
 */

describe('computeSkillProvenanceObjectLint', () => {
  it('returns no violations when all skills have clean provenance', () => {
    const skills = [
      {
        name: 'foo',
        provenance: { author: 'anvil-core', lastUpdated: '2026-05-10' },
      },
      {
        name: 'bar',
        provenance: {
          generatedBy: 'brainstorm-spec',
          lastUpdated: '2026-04-01',
        },
      },
    ]
    const violations = computeSkillProvenanceObjectLint(skills)
    expect(violations).toHaveLength(0)
  })

  it('warns when generatedBy is declared without lastUpdated', () => {
    const skills = [
      {
        name: 'auto-skill',
        provenance: { generatedBy: 'brainstorm-spec' },
      },
    ]
    const violations = computeSkillProvenanceObjectLint(skills)
    expect(violations).toHaveLength(1)
    expect(violations[0]!.skill).toBe('auto-skill')
    expect(violations[0]!.violation).toContain('generatedBy')
    expect(violations[0]!.violation).toContain('lastUpdated')
  })

  it('does NOT warn on generatedBy when lastUpdated is present', () => {
    const skills = [
      {
        name: 'auto-skill',
        provenance: {
          generatedBy: 'brainstorm-spec',
          lastUpdated: '2026-05-01',
        },
      },
    ]
    const violations = computeSkillProvenanceObjectLint(skills)
    expect(violations).toHaveLength(0)
  })

  it('skips skills with no provenance object (no violation)', () => {
    const skills = [{ name: 'no-provenance-skill' }, { name: 'another' }]
    // Without warnOnZeroCoverage, no violations for absent provenance
    const violations = computeSkillProvenanceObjectLint(skills)
    expect(violations).toHaveLength(0)
  })

  it('emits zero-coverage advisory when warnOnZeroCoverage and no skills have provenance', () => {
    const skills = [{ name: 'a' }, { name: 'b' }]
    const violations = computeSkillProvenanceObjectLint(skills, {
      warnOnZeroCoverage: true,
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]!.skill).toBe('*')
    expect(violations[0]!.violation).toContain('0 of 2')
  })

  it('does NOT emit zero-coverage advisory when at least one skill has provenance', () => {
    const skills = [{ name: 'a', provenance: { author: 'me' } }, { name: 'b' }]
    const violations = computeSkillProvenanceObjectLint(skills, {
      warnOnZeroCoverage: true,
    })
    expect(violations).toHaveLength(0)
  })

  it('returns no violations for empty skill list', () => {
    const violations = computeSkillProvenanceObjectLint([], {
      warnOnZeroCoverage: true,
    })
    expect(violations).toHaveLength(0)
  })

  it('collects multiple violations across different skills', () => {
    const skills = [
      { name: 'skill-a', provenance: { generatedBy: 'tool-x' } }, // missing lastUpdated
      { name: 'skill-b', provenance: { generatedBy: 'tool-y' } }, // missing lastUpdated
      { name: 'skill-c', provenance: { lastUpdated: '2026-01-01' } }, // fine
    ]
    const violations = computeSkillProvenanceObjectLint(skills)
    expect(violations).toHaveLength(2)
    expect(violations.map((v) => v.skill)).toEqual(['skill-a', 'skill-b'])
  })
})
