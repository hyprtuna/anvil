/**
 * ANV-0033 — Unit tests for ModelCapabilitySnapshot + ModelCapability Zod schemas.
 */

import { describe, expect, it } from 'vitest'
import {
  CapabilitySource,
  ModelCapability,
  ModelCapabilitySnapshot,
} from '../../../../src/core/types.js'

describe('ModelCapability', () => {
  it('parses a minimal valid record', () => {
    const result = ModelCapability.safeParse({
      id: 'claude-haiku-4-5',
      provider: 'anthropic',
    })
    expect(result.success).toBe(true)
  })

  it('parses a full record with all optional fields', () => {
    const result = ModelCapability.safeParse({
      id: 'claude-sonnet-4-6',
      provider: 'anthropic',
      family: 'claude-sonnet',
      context_window: 200000,
      max_output_tokens: 64000,
      supported_efforts: ['low', 'medium', 'high', 'max'],
      capabilities: {
        vision: true,
        json_mode: true,
        tool_use: true,
        extended_thinking: false,
      },
      deprecated: false,
      notes: 'Production model',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing id', () => {
    const result = ModelCapability.safeParse({ provider: 'anthropic' })
    expect(result.success).toBe(false)
  })

  it('rejects missing provider', () => {
    const result = ModelCapability.safeParse({ id: 'claude-haiku-4-5' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid supported_efforts values', () => {
    const result = ModelCapability.safeParse({
      id: 'claude-haiku-4-5',
      provider: 'anthropic',
      supported_efforts: ['turbo'],
    })
    expect(result.success).toBe(false)
  })
})

describe('ModelCapabilitySnapshot', () => {
  const validSnapshot = {
    schema_version: 1 as const,
    generated_at: '2026-05-14T00:00:00.000Z',
    source: 'manual-curated-v1',
    models: [
      { id: 'claude-haiku-4-5', provider: 'anthropic' },
      { id: 'claude-sonnet-4-6', provider: 'anthropic' },
    ],
  }

  it('round-trips a valid snapshot through parse', () => {
    const result = ModelCapabilitySnapshot.parse(validSnapshot)
    expect(result.schema_version).toBe(1)
    expect(result.models).toHaveLength(2)
    expect(result.source).toBe('manual-curated-v1')
  })

  it('rejects schema_version !== 1', () => {
    const result = ModelCapabilitySnapshot.safeParse({
      ...validSnapshot,
      schema_version: 2,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid generated_at format', () => {
    const result = ModelCapabilitySnapshot.safeParse({
      ...validSnapshot,
      generated_at: '2026-05-14',
    })
    expect(result.success).toBe(false)
  })

  it('allows duplicate ids — duplicate detection is at loader level, not schema', () => {
    // Zod does not deduplicate arrays; the loader checks for duplicates explicitly.
    const result = ModelCapabilitySnapshot.safeParse({
      ...validSnapshot,
      models: [
        { id: 'dup', provider: 'anthropic' },
        { id: 'dup', provider: 'anthropic' },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('CapabilitySource', () => {
  it('accepts all four valid variants', () => {
    for (const v of [
      'snapshot',
      'user-config',
      'heuristic',
      'unknown',
    ] as const) {
      expect(CapabilitySource.parse(v)).toBe(v)
    }
  })

  it('rejects unknown variant', () => {
    expect(CapabilitySource.safeParse('live-api').success).toBe(false)
  })
})
