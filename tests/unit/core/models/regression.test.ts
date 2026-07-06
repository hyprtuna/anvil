/**
 * Model-alias regression test.
 *
 * Purpose: pin the alias → model ID mapping produced by the default config so
 * that a future model-generation bump fails loudly here rather than silently
 * sending traffic to the wrong model.
 *
 * Update procedure:
 *   1. Change the expected model IDs below to match the new generation.
 *   2. Update CHANGELOG.md — add an entry under the unreleased section noting
 *      which aliases were re-pointed and to which model IDs.
 *
 * DO NOT update this test without updating the CHANGELOG.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveAlias } from '../../../../src/core/models/aliases.js'

describe('core/models/aliases — regression snapshot', () => {
  const aliases = buildDefaultConfig().model_aliases

  it('fast → claude-haiku-4-5', () => {
    expect(resolveAlias('fast', aliases)).toBe('claude-haiku-4-5')
  })

  it('balanced → claude-sonnet-4-6', () => {
    expect(resolveAlias('balanced', aliases)).toBe('claude-sonnet-4-6')
  })

  it('powerful → claude-opus-4-7', () => {
    // Phase B+: model_aliases.powerful → 'opus' (short alias) → claude-opus-4-7
    // via BUILTIN_MODEL_ALIASES; recursive expansion in resolveAlias.
    expect(resolveAlias('powerful', aliases)).toBe('claude-opus-4-7')
  })

  it('default → claude-sonnet-4-6', () => {
    expect(resolveAlias('default', aliases)).toBe('claude-sonnet-4-6')
  })
})
