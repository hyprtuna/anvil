/**
 * ANV-0033 — Verifies the bundled data/model-capabilities.json parses
 * correctly and contains the three currently-aliased model IDs.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ModelCapabilitySnapshot } from '../../../../src/core/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const snapshotPath = resolve(here, '../../../../data/model-capabilities.json')

describe('bundled model-capabilities.json', () => {
  it('parses via ModelCapabilitySnapshot schema', () => {
    const raw = readFileSync(snapshotPath, 'utf-8')
    const parsed = ModelCapabilitySnapshot.parse(JSON.parse(raw))
    expect(parsed.schema_version).toBe(1)
    expect(typeof parsed.generated_at).toBe('string')
    expect(parsed.source).toBe('manual-curated-v1')
  })

  it('contains the three aliased model IDs', () => {
    const raw = readFileSync(snapshotPath, 'utf-8')
    const parsed = ModelCapabilitySnapshot.parse(JSON.parse(raw))
    const ids = parsed.models.map((m) => m.id)
    expect(ids).toContain('claude-haiku-4-5')
    expect(ids).toContain('claude-sonnet-4-6')
    expect(ids).toContain('claude-opus-4-7')
  })

  it('has no duplicate model IDs', () => {
    const raw = readFileSync(snapshotPath, 'utf-8')
    const parsed = ModelCapabilitySnapshot.parse(JSON.parse(raw))
    const ids = parsed.models.map((m) => m.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('has supported_efforts consistent with BUILTIN_SUPPORTED_EFFORTS', () => {
    const raw = readFileSync(snapshotPath, 'utf-8')
    const parsed = ModelCapabilitySnapshot.parse(JSON.parse(raw))
    const byId = Object.fromEntries(parsed.models.map((m) => [m.id, m]))

    // Haiku: empty array (no effort)
    expect(byId['claude-haiku-4-5']?.supported_efforts).toEqual([])

    // Sonnet: low/medium/high/max (no xhigh)
    expect(byId['claude-sonnet-4-6']?.supported_efforts).toEqual([
      'low',
      'medium',
      'high',
      'max',
    ])

    // Opus: all five
    expect(byId['claude-opus-4-7']?.supported_efforts).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
  })
})
