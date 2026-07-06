/**
 * ANV-0118 — Compactable startup-guidance sections.
 *
 * Pure-function tests for compactStructuralSections. The function strips
 * whole structural sections (e.g., <anvil_skills>...</anvil_skills>) in
 * priority order (lowest priority first) until the text fits within the
 * supplied budget. Each elided section is replaced with a notice so the
 * model knows context was removed.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STARTUP_SECTION_PRIORITIES,
  type SectionPriority,
  compactStructuralSections,
} from '../../../../src/hooks/handlers/session-start/compaction.js'

describe('compactStructuralSections', () => {
  it('returns text unchanged when already under budget', () => {
    const text = 'short content'
    const result = compactStructuralSections(text, 1000, [
      { section: 'anvil_skills', priority: 0 },
    ])
    expect(result).toBe(text)
  })

  it('elides a large <anvil_agents> block when total exceeds budget', () => {
    const big = 'X'.repeat(5000)
    const text = `intro line\n<anvil_agents>\n${big}\n</anvil_agents>\noutro line`
    const result = compactStructuralSections(text, 200, [
      { section: 'anvil_agents', priority: 0 },
    ])
    expect(result).toContain('intro line')
    expect(result).toContain('outro line')
    expect(result).toContain('[anvil_agents elided to fit budget]')
    expect(result).not.toContain(big)
    expect(result.length).toBeLessThanOrEqual(200)
  })

  it('preserves non-structural content while stripping sections', () => {
    const big = 'A'.repeat(2000)
    const text = `keep me\n<anvil_skills>${big}</anvil_skills>\nkeep me too`
    const result = compactStructuralSections(text, 200, [
      { section: 'anvil_skills', priority: 0 },
    ])
    expect(result).toContain('keep me')
    expect(result).toContain('keep me too')
    expect(result).toContain('[anvil_skills elided to fit budget]')
  })

  it('elides multiple sections when budget is very tight', () => {
    const filler = 'Z'.repeat(2000)
    const text = [
      'header',
      `<routing_rules>${filler}</routing_rules>`,
      `<anvil_agents>${filler}</anvil_agents>`,
      `<anvil_skills>${filler}</anvil_skills>`,
      'footer',
    ].join('\n')
    const result = compactStructuralSections(text, 300, [
      { section: 'anvil_skills', priority: 0 },
      { section: 'anvil_agents', priority: 1 },
      { section: 'routing_rules', priority: 2 },
    ])
    expect(result).toContain('header')
    expect(result).toContain('footer')
    expect(result).not.toContain(filler)
    expect(result.length).toBeLessThanOrEqual(300)
  })

  it('elides lowest-priority section first when removing one fits budget', () => {
    // Two sections of roughly equal size; budget allows keeping the higher
    // priority one but not both. Lowest-priority MUST be elided first.
    const filler = 'Q'.repeat(500)
    const text = [
      'intro',
      `<anvil_skills>${filler}</anvil_skills>`,
      `<anvil_agents>${filler}</anvil_agents>`,
      'outro',
    ].join('\n')
    // anvil_skills priority=0 (elided first), anvil_agents priority=10 (kept)
    const result = compactStructuralSections(text, 700, [
      { section: 'anvil_skills', priority: 0 },
      { section: 'anvil_agents', priority: 10 },
    ])
    expect(result).toContain('[anvil_skills elided to fit budget]')
    expect(result).toContain(filler) // anvil_agents body preserved
    expect(result).toContain('intro')
    expect(result).toContain('outro')
  })

  it('handles missing sections gracefully (no-op for absent tags)', () => {
    const text = 'just text, no structural sections here'
    const result = compactStructuralSections(text, 1000, [
      { section: 'anvil_skills', priority: 0 },
      { section: 'anvil_agents', priority: 1 },
    ])
    expect(result).toBe(text)
  })

  it('tolerates malformed sections (unclosed tag) without throwing', () => {
    const text = 'pre\n<anvil_agents>\nopen but never closed\nstill text'
    expect(() =>
      compactStructuralSections(text, 100, [
        { section: 'anvil_agents', priority: 0 },
      ]),
    ).not.toThrow()
  })

  it('handles nested-looking tags non-greedily (each section matched independently)', () => {
    const text = [
      '<anvil_skills>skill content</anvil_skills>',
      'middle',
      '<anvil_agents>agent content</anvil_agents>',
    ].join('\n')
    const result = compactStructuralSections(text, 80, [
      { section: 'anvil_skills', priority: 0 },
      { section: 'anvil_agents', priority: 1 },
    ])
    // The first section should be elided first (lowest priority).
    expect(result).toContain('[anvil_skills elided to fit budget]')
    expect(result).toContain('middle')
  })

  it('exports a default priority list with the five expected sections', () => {
    const names = DEFAULT_STARTUP_SECTION_PRIORITIES.map((p) => p.section)
    expect(names).toContain('anvil_skills')
    expect(names).toContain('anvil_agents')
    expect(names).toContain('routing_rules')
    expect(names).toContain('agent_catalog')
    expect(names).toContain('team_compositions')
  })

  it('default priorities are unique numbers', () => {
    const priorities = DEFAULT_STARTUP_SECTION_PRIORITIES.map((p) => p.priority)
    expect(new Set(priorities).size).toBe(priorities.length)
  })

  it('stops eliding once budget is satisfied (does not strip unnecessarily)', () => {
    const filler = 'F'.repeat(1000)
    const small = 'small_section_body'
    const text = [
      'intro',
      `<anvil_skills>${filler}</anvil_skills>`,
      `<anvil_agents>${small}</anvil_agents>`,
      'outro',
    ].join('\n')
    // Budget large enough to keep <anvil_agents> after stripping <anvil_skills>.
    const result = compactStructuralSections(text, 200, [
      { section: 'anvil_skills', priority: 0 },
      { section: 'anvil_agents', priority: 1 },
    ])
    expect(result).toContain('[anvil_skills elided to fit budget]')
    expect(result).toContain(small) // not stripped — budget satisfied
  })

  it('accepts SectionPriority type structure', () => {
    const p: SectionPriority = { section: 'foo', priority: 0 }
    expect(p.section).toBe('foo')
    expect(p.priority).toBe(0)
  })
})
