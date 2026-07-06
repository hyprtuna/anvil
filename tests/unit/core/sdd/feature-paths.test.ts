import { describe, expect, it } from 'vitest'
import {
  featureDir,
  normalizeSlug,
  planPath,
  specPath,
  tasksPath,
} from '../../../../src/core/sdd/feature-paths.js'

describe('normalizeSlug', () => {
  it('lowercases and kebab-cases a plain phrase', () => {
    expect(normalizeSlug('My Feature 2026')).toBe('my-feature-2026')
  })

  it('replaces whitespace with hyphens', () => {
    expect(normalizeSlug('hello   world')).toBe('hello-world')
  })

  it('strips non-[a-z0-9-] characters', () => {
    expect(normalizeSlug('hello_world!')).toBe('helloworld')
  })

  it('collapses repeated hyphens', () => {
    expect(normalizeSlug('foo--bar---baz')).toBe('foo-bar-baz')
  })

  it('trims leading and trailing hyphens', () => {
    expect(normalizeSlug('-hello-world-')).toBe('hello-world')
  })

  it('strips leading date prefix (YYYY-MM-DD-)', () => {
    expect(normalizeSlug('2026-04-26-feature-x')).toBe('feature-x')
  })

  it('throws when slug is empty after normalization', () => {
    expect(() => normalizeSlug('!!!')).toThrow(/empty.*slug|slug.*empty/i)
  })

  it('throws when input is empty string', () => {
    expect(() => normalizeSlug('')).toThrow(/empty.*slug|slug.*empty/i)
  })

  it('passthrough: already-kebab slug unchanged', () => {
    expect(normalizeSlug('demo')).toBe('demo')
  })
})

describe('featureDir', () => {
  // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
  it('returns .anvil/specs/features/<slug>', () => {
    expect(featureDir('demo')).toBe('.anvil/specs/features/demo')
  })

  it('normalizes the slug', () => {
    expect(featureDir('My Feature')).toBe('.anvil/specs/features/my-feature')
  })
})

describe('specPath', () => {
  it('appends spec.md to featureDir', () => {
    expect(specPath('demo')).toBe('.anvil/specs/features/demo/spec.md')
  })
})

describe('planPath', () => {
  it('appends plan.md to featureDir', () => {
    expect(planPath('demo')).toBe('.anvil/specs/features/demo/plan.md')
  })
})

describe('tasksPath', () => {
  it('appends tasks.md to featureDir', () => {
    expect(tasksPath('demo')).toBe('.anvil/specs/features/demo/tasks.md')
  })
})
