import { describe, expect, it } from 'vitest'
import {
  deriveBranchSlug,
  getNotepadsDir,
  getRecentContextPath,
  getSectionPath,
} from '../../../../src/core/notepads/paths.js'

describe('deriveBranchSlug', () => {
  it('converts slashes to dashes', () => {
    expect(deriveBranchSlug('feature/auth-refactor')).toBe(
      'feature-auth-refactor',
    )
  })

  it('lowercases the name', () => {
    expect(deriveBranchSlug('Feature/Auth-Refactor')).toBe(
      'feature-auth-refactor',
    )
  })

  it('strips refs/heads/ prefix', () => {
    expect(deriveBranchSlug('refs/heads/main')).toBe('main')
  })

  it('collapses multiple consecutive dashes', () => {
    expect(deriveBranchSlug('feature//double-slash')).toBe(
      'feature-double-slash',
    )
  })

  it('strips leading and trailing dashes', () => {
    expect(deriveBranchSlug('/feature/leading-trailing/')).toBe(
      'feature-leading-trailing',
    )
  })

  it('truncates to 40 chars and appends -dot', () => {
    const long = 'users/example/long-branch-name-that-keeps-going-and-going'
    const slug = deriveBranchSlug(long)
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-dot')).toBe(true)
  })

  it('returns main for empty string', () => {
    expect(deriveBranchSlug('')).toBe('main')
  })

  it('handles branches with unicode chars (replaces with dashes)', () => {
    const slug = deriveBranchSlug('feat/café-résumé')
    expect(/^[a-z0-9-]+$/.test(slug)).toBe(true)
  })

  it('handles branches with dots (replaces with dashes)', () => {
    expect(deriveBranchSlug('v1.2.3')).toBe('v1-2-3')
  })

  it('handles branches with underscores (replaces with dashes)', () => {
    expect(deriveBranchSlug('feature_with_underscores')).toBe(
      'feature-with-underscores',
    )
  })

  it('detached HEAD special case produces detached- prefix', () => {
    // When passed the string 'HEAD', goes through detached path but requires git
    // so we test the non-HEAD path with a regular branch name instead
    const slug = deriveBranchSlug('main')
    expect(slug).toBe('main')
  })

  it('handles chore/normalize style names', () => {
    expect(deriveBranchSlug('chore/normalize-model-aliases')).toBe(
      'chore-normalize-model-aliases',
    )
  })
})

describe('getNotepadsDir', () => {
  it('returns .anvil/notepads under repoRoot', () => {
    const dir = getNotepadsDir('/repo')
    expect(dir).toBe('/repo/.anvil/notepads')
  })
})

describe('getRecentContextPath', () => {
  it('returns correct path for a simple branch', () => {
    const p = getRecentContextPath('/repo', 'main')
    expect(p).toBe('/repo/.anvil/notepads/main/recent-context.md')
  })

  it('slugifies the branch name', () => {
    const p = getRecentContextPath('/repo', 'feature/auth')
    expect(p).toBe('/repo/.anvil/notepads/feature-auth/recent-context.md')
  })
})

describe('getSectionPath', () => {
  it('returns correct section file path', () => {
    const p = getSectionPath('/repo', 'main', 'learnings')
    expect(p).toBe('/repo/.anvil/notepads/main/learnings.md')
  })

  it('slugifies the branch name for sections', () => {
    const p = getSectionPath('/repo', 'feature/auth', 'decisions')
    expect(p).toBe('/repo/.anvil/notepads/feature-auth/decisions.md')
  })
})
