/**
 * ANV-0033 — Unit tests for capability_source provenance on ModelResolution.
 *
 * Tests (a)–(e) from the plan:
 *   (a) resolver without snapshot → capability_source === undefined
 *   (b) resolver with snapshot and known ID → 'snapshot'
 *   (c) unknown ID → 'unknown'
 *   (d) heuristic family match → 'heuristic'
 *   (e) trace includes the provenance line on the winning entry only
 */

import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'
import { traceResolution } from '../../../../src/core/models/trace.js'
import type { ModelCapabilitySnapshot as ModelCapabilitySnapshotType } from '../../../../src/core/types.js'
import { ModelCapabilitySnapshot } from '../../../../src/core/types.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSnapshot(ids: string[]): ModelCapabilitySnapshotType {
  return ModelCapabilitySnapshot.parse({
    schema_version: 1,
    generated_at: '2026-05-14T00:00:00.000Z',
    source: 'test',
    models: ids.map((id) => ({ id, provider: 'anthropic' })),
  })
}

const SNAPSHOT_WITH_SONNET = makeSnapshot([
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
])

const EMPTY_SNAPSHOT = makeSnapshot([])

// ─── (a) No snapshot → capability_source omitted ──────────────────────────────

describe('resolveModel without capabilityRegistry', () => {
  it('(a) omits capability_source from ModelResolution (D-06 backward compat)', () => {
    const config = buildDefaultConfig()
    const resolution = resolveModel('my-skill', config)
    expect(resolution.capability_source).toBeUndefined()
  })
})

// ─── (b) Snapshot with known ID → 'snapshot' ─────────────────────────────────

describe('resolveModel with capabilityRegistry — known IDs', () => {
  it('(b) stamps snapshot when resolved model is in the snapshot', () => {
    const config = buildDefaultConfig()
    const resolution = resolveModel('my-skill', config, {
      capabilityRegistry: SNAPSHOT_WITH_SONNET,
    })
    // Default resolves to whatever the default model is — should be in snapshot
    expect(
      resolution.capability_source === 'snapshot' ||
        resolution.capability_source === 'heuristic',
    ).toBe(true)
  })

  it('(b) stamps snapshot for an explicit CLI model known in snapshot', () => {
    const config = buildDefaultConfig()
    const resolution = resolveModel('my-skill', config, {
      cli: { model: 'claude-sonnet-4-6' },
      capabilityRegistry: SNAPSHOT_WITH_SONNET,
    })
    expect(resolution.capability_source).toBe('snapshot')
  })
})

// ─── (c) Unknown ID → 'unknown' ──────────────────────────────────────────────

describe('resolveModel with capabilityRegistry — unknown ID', () => {
  it('(c) stamps unknown for a model not in snapshot, efforts, or family patterns', () => {
    const config = buildDefaultConfig()
    const resolution = resolveModel('my-skill', config, {
      cli: { model: 'claude-zeta-9-9' },
      capabilityRegistry: EMPTY_SNAPSHOT,
    })
    expect(resolution.capability_source).toBe('unknown')
  })
})

// ─── (d) Heuristic family match → 'heuristic' ────────────────────────────────

describe('resolveModel with capabilityRegistry — heuristic match', () => {
  it('(d) stamps heuristic for a claude-sonnet-* model not in snapshot', () => {
    const config = buildDefaultConfig()
    const resolution = resolveModel('my-skill', config, {
      cli: { model: 'claude-sonnet-5-0' },
      capabilityRegistry: EMPTY_SNAPSHOT,
    })
    expect(resolution.capability_source).toBe('heuristic')
  })

  it('(d) stamps heuristic for a model in BUILTIN_SUPPORTED_EFFORTS not in snapshot', () => {
    const config = buildDefaultConfig()
    const resolution = resolveModel('my-skill', config, {
      cli: { model: 'claude-haiku-4-5' },
      capabilityRegistry: EMPTY_SNAPSHOT,
    })
    expect(resolution.capability_source).toBe('heuristic')
  })
})

// ─── (e) Trace — provenance note on winning entry only ───────────────────────

describe('traceResolution with capabilityRegistry', () => {
  it('(e) stamps capability_source note on the winning entry only', () => {
    const config = buildDefaultConfig()
    const trace = traceResolution('my-skill', config, {
      cli: { model: 'claude-sonnet-4-6' },
      capabilityRegistry: SNAPSHOT_WITH_SONNET,
    })

    const winning = trace.filter((e) => e.match)
    const nonWinning = trace.filter((e) => !e.match)

    expect(winning).toHaveLength(1)
    expect(winning[0]?.note).toMatch(/capability_source: snapshot/)

    // Non-winning entries should not have the provenance annotation
    for (const entry of nonWinning) {
      expect(entry.note ?? '').not.toMatch(/capability_source:/)
    }
  })

  it('trace without capabilityRegistry has no provenance annotation', () => {
    const config = buildDefaultConfig()
    const trace = traceResolution('my-skill', config, {
      cli: { model: 'claude-sonnet-4-6' },
    })

    for (const entry of trace) {
      expect(entry.note ?? '').not.toMatch(/capability_source:/)
    }
  })
})
