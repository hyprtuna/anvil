import { describe, expect, it } from 'vitest'
import {
  type IntegrationEntry,
  KNOWN_INTEGRATIONS,
} from '../../../../src/core/integrations/known.js'

describe('KNOWN_INTEGRATIONS schema shape', () => {
  it('exports a record keyed by adapter name', () => {
    expect(typeof KNOWN_INTEGRATIONS).toBe('object')
    expect('claude-code' in KNOWN_INTEGRATIONS).toBe(true)
    expect('opencode' in KNOWN_INTEGRATIONS).toBe(true)
  })

  it('claude-code list contains at least one entry', () => {
    expect(KNOWN_INTEGRATIONS['claude-code'].length).toBeGreaterThan(0)
  })

  it('every entry has required fields with correct types', () => {
    const allEntries: IntegrationEntry[] = [
      ...KNOWN_INTEGRATIONS['claude-code'],
      ...KNOWN_INTEGRATIONS.opencode,
    ]
    for (const entry of allEntries) {
      expect(typeof entry.slug).toBe('string')
      expect(entry.slug.length).toBeGreaterThan(0)
      expect(['memory', 'context', 'observability']).toContain(entry.category)
      expect(typeof entry.reason).toBe('string')
      expect(entry.reason.length).toBeGreaterThan(0)
      if (entry.docUrl !== undefined) {
        expect(typeof entry.docUrl).toBe('string')
      }
    }
  })

  it('claude-mem is present in the claude-code integration list', () => {
    const claudeMemEntry = KNOWN_INTEGRATIONS['claude-code'].find(
      (e) => e.slug === 'claude-mem',
    )
    expect(claudeMemEntry).toBeDefined()
    expect(claudeMemEntry?.category).toBe('memory')
    expect(claudeMemEntry?.reason).toBeTruthy()
  })

  it('opencode list is an array (may be empty)', () => {
    expect(Array.isArray(KNOWN_INTEGRATIONS.opencode)).toBe(true)
  })
})
