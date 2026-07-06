import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// The Zod schema used internally by reviewCommand — tested in isolation
const ReviewTypeOption = z
  .enum(['spec-compliance', 'code-quality', 'both'])
  .default('both')

describe('review --type flag Zod validation', () => {
  it('accepts spec-compliance', () => {
    expect(ReviewTypeOption.parse('spec-compliance')).toBe('spec-compliance')
  })

  it('accepts code-quality', () => {
    expect(ReviewTypeOption.parse('code-quality')).toBe('code-quality')
  })

  it('accepts both', () => {
    expect(ReviewTypeOption.parse('both')).toBe('both')
  })

  it('defaults to both when undefined is passed', () => {
    expect(ReviewTypeOption.parse(undefined)).toBe('both')
  })

  it('rejects an invalid value', () => {
    expect(() => ReviewTypeOption.parse('all')).toThrow()
  })

  it('rejects an empty string', () => {
    expect(() => ReviewTypeOption.parse('')).toThrow()
  })
})
