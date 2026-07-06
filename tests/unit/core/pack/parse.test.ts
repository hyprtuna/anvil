/**
 * ANV-0096 — parsePackSlug unit tests.
 */

import { describe, expect, it } from 'vitest'
import { parsePackSlug } from '../../../../src/core/pack/parse.js'

describe('parsePackSlug', () => {
  it('accepts bare slug', () => {
    expect(parsePackSlug('code-review')).toEqual({
      pack: null,
      slug: 'code-review',
    })
  })

  it('accepts pack:slug', () => {
    expect(parsePackSlug('myteam:code-review')).toEqual({
      pack: 'myteam',
      slug: 'code-review',
    })
  })

  it('accepts single-char pack and slug', () => {
    expect(parsePackSlug('a:b')).toEqual({ pack: 'a', slug: 'b' })
  })

  it('rejects uppercase pack', () => {
    expect(parsePackSlug('Pack:slug')).toBeNull()
  })

  it('rejects uppercase slug', () => {
    expect(parsePackSlug('pack:Slug')).toBeNull()
  })

  it('rejects empty slug after colon', () => {
    expect(parsePackSlug('pack:')).toBeNull()
  })

  it('rejects empty pack before colon', () => {
    expect(parsePackSlug(':slug')).toBeNull()
  })

  it('rejects extra colon (a:b:c)', () => {
    expect(parsePackSlug('a:b:c')).toBeNull()
  })

  it('rejects pack:slug:extra', () => {
    expect(parsePackSlug('pack:slug:extra')).toBeNull()
  })

  it('rejects empty string', () => {
    expect(parsePackSlug('')).toBeNull()
  })

  it('rejects slug ending in hyphen', () => {
    expect(parsePackSlug('foo-')).toBeNull()
  })

  it('rejects slug starting in hyphen', () => {
    expect(parsePackSlug('-foo')).toBeNull()
  })

  it('rejects whitespace in slug', () => {
    expect(parsePackSlug('foo bar')).toBeNull()
  })

  it('rejects oversized input', () => {
    const huge = `${'a'.repeat(200)}:${'b'.repeat(200)}`
    expect(parsePackSlug(huge)).toBeNull()
  })

  it('rejects underscores', () => {
    expect(parsePackSlug('my_pack:slug')).toBeNull()
  })
})
