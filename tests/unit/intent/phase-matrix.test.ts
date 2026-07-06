/**
 * 28-case table-driven phase-resolution matrix test (Plan 36 Phase E).
 *
 * The SDD-over-application risk mitigation: enforces that the 6
 * non-implementation intents (meta/research/debug/review/verify/tdd)
 * ALWAYS emit `proceed` regardless of artifact state.
 *
 * 7 intents × 4 artifact states = 28 cases minimum.
 *
 * Artifact states:
 *   0 — no active feature (feature_slug null)
 *   1 — feature active, spec missing, plan missing
 *   2 — feature active, spec present, plan missing
 *   3 — feature active, spec present, plan present
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type Directive,
  resolvePhaseDirective,
} from '../../../src/intent/phase-matrix.js'

const TEST_CWD = join('/tmp', 'anvil-phase-matrix-test')

function writeState(cwd: string, slug: string | null) {
  const anvilDir = join(cwd, '.anvil')
  mkdirSync(anvilDir, { recursive: true })
  writeFileSync(
    join(anvilDir, 'state.json'),
    JSON.stringify({
      schema_version: 1,
      ...(slug ? { feature_slug: slug } : {}),
      phase: slug ? 'implement' : 'none',
      completed_tasks: [],
      pending_tasks: [],
      updated_at: new Date().toISOString(),
    }),
    'utf-8',
  )
}

function writeSpec(cwd: string, slug: string) {
  // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
  const dir = join(cwd, '.anvil', 'specs', 'features', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'spec.md'), '## Goal\nTest feature\n', 'utf-8')
}

function writePlan(cwd: string, slug: string) {
  // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
  const dir = join(cwd, '.anvil', 'specs', 'features', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plan.md'), '# Plan\nPlan content\n', 'utf-8')
}

/**
 * Artifact state helper — sets up cwd for one of the 4 test scenarios.
 *
 * State 0: no active feature
 * State 1: feature active, no spec, no plan
 * State 2: feature active, spec present, no plan
 * State 3: feature active, spec present, plan present
 */
async function setupArtifactState(
  cwd: string,
  state: 0 | 1 | 2 | 3,
): Promise<void> {
  if (state === 0) {
    // No state file = no active feature
    return
  }
  const slug = 'test-feature'
  writeState(cwd, slug)
  if (state >= 2) writeSpec(cwd, slug)
  if (state >= 3) writePlan(cwd, slug)
}

// ── Intent × ArtifactState → expected Directive ───────────────────────────

/**
 * Phase matrix table.
 *
 * Non-implementation intents ALWAYS proceed regardless of artifact state.
 * That is the core SDD-over-application safety property.
 *
 * Columns: intent, artifactState, expectedKind, expectedTarget
 */
type MatrixRow = {
  intent: string
  artifactState: 0 | 1 | 2 | 3
  expectedKind: 'proceed' | 'redirect'
  expectedTarget?: 'spec' | 'plan'
  label: string
}

const NON_IMPL_INTENTS = [
  'meta',
  'research',
  'debug',
  'review',
  'verify',
  'tdd',
] as const

const ARTIFACT_STATES: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3]

// Build the 24 non-implementation rows (6 intents × 4 states = 24)
const NON_IMPL_ROWS: MatrixRow[] = []
for (const intent of NON_IMPL_INTENTS) {
  for (const artifactState of ARTIFACT_STATES) {
    NON_IMPL_ROWS.push({
      intent,
      artifactState,
      expectedKind: 'proceed',
      label: `${intent} / state=${artifactState} → proceed (no SDD)`,
    })
  }
}

// 4 implementation intent rows (1 per artifact state)
const IMPL_ROWS: MatrixRow[] = [
  {
    intent: 'implementation',
    artifactState: 0,
    expectedKind: 'redirect',
    expectedTarget: 'spec',
    label: 'implementation / no active feature → redirect:spec',
  },
  {
    intent: 'implementation',
    artifactState: 1,
    expectedKind: 'redirect',
    expectedTarget: 'spec',
    label: 'implementation / active feature, no spec → redirect:spec',
  },
  {
    intent: 'implementation',
    artifactState: 2,
    expectedKind: 'redirect',
    expectedTarget: 'plan',
    label: 'implementation / spec present, no plan → redirect:plan',
  },
  {
    intent: 'implementation',
    artifactState: 3,
    expectedKind: 'proceed',
    label: 'implementation / spec + plan present → proceed',
  },
]

// Total: 28 rows (24 non-impl + 4 impl)
const MATRIX: MatrixRow[] = [...NON_IMPL_ROWS, ...IMPL_ROWS]

describe('intent/phase-matrix — 28-case table-driven tests', () => {
  beforeEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
    mkdirSync(TEST_CWD, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
  })

  // Verify we actually have 28 test cases
  it('matrix has exactly 28 cases', () => {
    expect(MATRIX).toHaveLength(28)
  })

  // Table-driven: one test per row
  for (const row of MATRIX) {
    it(row.label, async () => {
      await setupArtifactState(TEST_CWD, row.artifactState)

      const directive: Directive = await resolvePhaseDirective(
        row.intent,
        TEST_CWD,
      )

      expect(directive.kind).toBe(row.expectedKind)
      if (row.expectedTarget !== undefined) {
        expect(directive.target).toBe(row.expectedTarget)
      }
      // Directive must always have a reason string
      expect(typeof directive.reason).toBe('string')
      expect(directive.reason.length).toBeGreaterThan(0)
    })
  }
})

// ── Directive shape contract ───────────────────────────────────────────────

describe('intent/phase-matrix — Directive shape', () => {
  beforeEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
    mkdirSync(TEST_CWD, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
  })

  it('proceed directive has kind=proceed, no target', async () => {
    const d = await resolvePhaseDirective('research', TEST_CWD)
    expect(d.kind).toBe('proceed')
    expect(d.target).toBeUndefined()
    expect(typeof d.soft).toBe('boolean')
  })

  it('redirect directive has kind=redirect and a target', async () => {
    writeState(TEST_CWD, 'feat')
    // No spec, no plan: implementation → redirect:spec
    const d = await resolvePhaseDirective('implementation', TEST_CWD)
    expect(d.kind).toBe('redirect')
    expect(['spec', 'plan']).toContain(d.target)
  })

  it('soft flag is boolean on all directives', async () => {
    const d1 = await resolvePhaseDirective('meta', TEST_CWD)
    expect(typeof d1.soft).toBe('boolean')

    writeState(TEST_CWD, 'feat')
    const d2 = await resolvePhaseDirective('implementation', TEST_CWD)
    expect(typeof d2.soft).toBe('boolean')
  })
})
