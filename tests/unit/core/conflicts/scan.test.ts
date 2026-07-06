import { describe, expect, it } from 'vitest'
import {
  extractCcInstalledSlugs,
  scanForConflicts,
} from '../../../../src/core/conflicts/scan.js'

describe('extractCcInstalledSlugs', () => {
  it('returns empty array for null', () => {
    expect(extractCcInstalledSlugs(null)).toEqual([])
  })

  it('returns empty array for non-object', () => {
    expect(extractCcInstalledSlugs('string')).toEqual([])
    expect(extractCcInstalledSlugs(42)).toEqual([])
    expect(extractCcInstalledSlugs([])).toEqual([])
  })

  it('returns empty array for non-v2 version (v1, v3, missing)', () => {
    expect(
      extractCcInstalledSlugs({ version: 1, plugins: { 'x@user': [] } }),
    ).toEqual([])
    expect(
      extractCcInstalledSlugs({ version: 3, plugins: { 'x@user': [] } }),
    ).toEqual([])
    expect(extractCcInstalledSlugs({ plugins: { 'x@user': [] } })).toEqual([])
  })

  it('returns empty array when plugins key is missing', () => {
    expect(extractCcInstalledSlugs({ version: 2 })).toEqual([])
  })

  it('returns empty array when plugins is not an object', () => {
    expect(extractCcInstalledSlugs({ version: 2, plugins: [] })).toEqual([])
    expect(extractCcInstalledSlugs({ version: 2, plugins: null })).toEqual([])
  })

  it('extracts slug from slug@scope key', () => {
    const payload = {
      version: 2,
      plugins: { 'superpowers@user': [{ scope: 'user' }] },
    }
    expect(extractCcInstalledSlugs(payload)).toEqual(['superpowers'])
  })

  it('handles key with no @ (returns whole key as slug)', () => {
    const payload = { version: 2, plugins: { 'bare-slug': [] } }
    expect(extractCcInstalledSlugs(payload)).toEqual(['bare-slug'])
  })

  it('extracts multiple slugs', () => {
    const payload = {
      version: 2,
      plugins: {
        'anvil@anvil': [{ scope: 'user' }],
        'superpowers@user': [{ scope: 'user' }],
        'claude-hud@user': [{ scope: 'user' }],
      },
    }
    const slugs = extractCcInstalledSlugs(payload)
    expect(slugs).toHaveLength(3)
    expect(slugs).toContain('anvil')
    expect(slugs).toContain('superpowers')
    expect(slugs).toContain('claude-hud')
  })
})

describe('scanForConflicts', () => {
  it('returns empty array when no installed slugs', () => {
    expect(scanForConflicts('claude-code', [])).toEqual([])
  })

  it('returns empty array for unknown adapter', () => {
    expect(scanForConflicts('unknown-adapter', ['superpowers'])).toEqual([])
  })

  it('detects a known conflicting plugin', () => {
    const hits = scanForConflicts('claude-code', ['superpowers'])
    expect(hits).toHaveLength(1)
    expect(hits[0].slug).toBe('superpowers')
    expect(hits[0].reason).toContain('SessionStart')
  })

  it('detects block-no-verify conflict', () => {
    const hits = scanForConflicts('claude-code', ['block-no-verify'])
    expect(hits).toHaveLength(1)
    expect(hits[0].slug).toBe('block-no-verify')
    expect(hits[0].reason).toContain('hook')
  })

  it('does NOT flag claude-mem as a conflict ( reclassification)', () => {
    // claude-mem was removed from KNOWN_CONFLICTS and moved to KNOWN_INTEGRATIONS.
    // This assertion locks the reclassification in — no regression.
    const hits = scanForConflicts('claude-code', ['claude-mem'])
    expect(hits).toHaveLength(0)
  })

  it('detects claude-hud conflict', () => {
    const hits = scanForConflicts('claude-code', ['claude-hud'])
    expect(hits).toHaveLength(1)
    expect(hits[0].slug).toBe('claude-hud')
    expect(hits[0].reason).toContain('statusLine')
  })

  it('detects autocomplete-pro conflict', () => {
    const hits = scanForConflicts('claude-code', ['autocomplete-pro'])
    expect(hits).toHaveLength(1)
    expect(hits[0].slug).toBe('autocomplete-pro')
    expect(hits[0].reason).toContain('Stop hook')
  })

  it('does not report false positive for non-conflicting plugins', () => {
    const hits = scanForConflicts('claude-code', [
      'anvil',
      'my-custom-plugin',
      'safe-plugin',
    ])
    expect(hits).toHaveLength(0)
  })

  it('is case-insensitive for slug matching', () => {
    const hits = scanForConflicts('claude-code', ['Superpowers'])
    expect(hits).toHaveLength(1)
    expect(hits[0].slug).toBe('superpowers')
  })

  it('returns multiple hits when multiple conflicting plugins are installed', () => {
    const hits = scanForConflicts('claude-code', [
      'superpowers',
      'claude-hud',
      'safe-plugin',
    ])
    expect(hits).toHaveLength(2)
    const slugs = hits.map((h) => h.slug)
    expect(slugs).toContain('superpowers')
    expect(slugs).toContain('claude-hud')
  })

  it('returns empty for opencode adapter (no conflicts defined yet)', () => {
    const hits = scanForConflicts('opencode', ['superpowers', 'claude-hud'])
    expect(hits).toHaveLength(0)
  })
})
