/**
 * Tests for catalog/common.ts helpers.
 */

import { describe, expect, it } from 'vitest'
import { parseSourceSlug } from '../../../../src/experimental/catalog/cli/common.js'

describe('parseSourceSlug', () => {
  it('parses a valid source:slug', () => {
    expect(parseSourceSlug('wshobson:code-reviewer')).toEqual({
      sourceId: 'wshobson',
      slug: 'code-reviewer',
    })
  })

  it('returns null for missing colon', () => {
    expect(parseSourceSlug('wshobson-code-reviewer')).toBeNull()
  })

  it('returns null for empty sourceId (colon at start)', () => {
    expect(parseSourceSlug(':code-reviewer')).toBeNull()
  })

  it('returns null for empty slug (colon at end)', () => {
    expect(parseSourceSlug('wshobson:')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseSourceSlug('')).toBeNull()
  })

  it('handles slug containing hyphens', () => {
    expect(parseSourceSlug('src:my-awesome-agent')).toEqual({
      sourceId: 'src',
      slug: 'my-awesome-agent',
    })
  })
})
