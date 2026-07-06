/**
 * End-to-end redirect tests for the SDD intent router (Plan 36 Phase E).
 *
 * Drives the router+phase-matrix path with mock states; asserts:
 *  1. implementation intent with no active feature → redirect to spec phase (/sdd-workflow)
 *  2. implementation intent with spec but no plan → redirect to plan phase (anvil plan)
 *  3. implementation intent with spec + plan → proceed
 *
 * ANV-0249: 'anvil spec' CLI deleted; SDD entry point is /sdd-workflow skill.
 * Phase-matrix still emits target:'spec' (phase redirect), not a CLI command name.
 *
 * No live LLM calls. Uses the pure resolvePhaseDirective function.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type Directive,
  resolvePhaseDirective,
} from '../../../src/intent/phase-matrix.js'

const TEST_CWD = join('/tmp', 'anvil-e2e-redirect-test')

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

describe('SDD end-to-end redirect integration', () => {
  beforeEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
    mkdirSync(TEST_CWD, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
  })

  it('implementation intent with no active feature → redirect to spec phase', async () => {
    // No state.json, no feature_slug
    const directive: Directive = await resolvePhaseDirective(
      'implementation',
      TEST_CWD,
    )
    expect(directive.kind).toBe('redirect')
    expect(directive.target).toBe('spec')
    expect(directive.reason).toMatch(/spec|no active feature/i)
  })

  it('implementation intent with active feature but no spec → redirect to spec phase', async () => {
    writeState(TEST_CWD, 'my-feature')
    // No spec.md, no plan.md
    const directive: Directive = await resolvePhaseDirective(
      'implementation',
      TEST_CWD,
    )
    expect(directive.kind).toBe('redirect')
    expect(directive.target).toBe('spec')
  })

  it('implementation intent with spec but no plan → redirect to anvil plan', async () => {
    writeState(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature')
    // No plan.md
    const directive: Directive = await resolvePhaseDirective(
      'implementation',
      TEST_CWD,
    )
    expect(directive.kind).toBe('redirect')
    expect(directive.target).toBe('plan')
    expect(directive.reason).toMatch(/plan/i)
  })

  it('implementation intent with spec + plan → proceed', async () => {
    writeState(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature')
    writePlan(TEST_CWD, 'my-feature')

    const directive: Directive = await resolvePhaseDirective(
      'implementation',
      TEST_CWD,
    )
    expect(directive.kind).toBe('proceed')
    expect(directive.target).toBeUndefined()
  })

  // ── Non-implementation intents always proceed ──────────────────────────

  it('research intent always proceeds regardless of artifact state', async () => {
    // No feature at all
    const d1 = await resolvePhaseDirective('research', TEST_CWD)
    expect(d1.kind).toBe('proceed')

    // With active feature but no artifacts
    writeState(TEST_CWD, 'my-feature')
    const d2 = await resolvePhaseDirective('research', TEST_CWD)
    expect(d2.kind).toBe('proceed')
  })

  it('debug intent always proceeds', async () => {
    const d = await resolvePhaseDirective('debug', TEST_CWD)
    expect(d.kind).toBe('proceed')
  })

  it('review intent always proceeds', async () => {
    const d = await resolvePhaseDirective('review', TEST_CWD)
    expect(d.kind).toBe('proceed')
  })

  it('meta intent always proceeds', async () => {
    const d = await resolvePhaseDirective('meta', TEST_CWD)
    expect(d.kind).toBe('proceed')
  })

  it('verify intent always proceeds', async () => {
    const d = await resolvePhaseDirective('verify', TEST_CWD)
    expect(d.kind).toBe('proceed')
  })

  it('tdd intent always proceeds', async () => {
    const d = await resolvePhaseDirective('tdd', TEST_CWD)
    expect(d.kind).toBe('proceed')
  })

  // ── Redirect messages contain actionable hints ─────────────────────────

  it('redirect to spec includes the /sdd-workflow hint', async () => {
    const directive = await resolvePhaseDirective('implementation', TEST_CWD)
    expect(directive.kind).toBe('redirect')
    expect(directive.reason).toMatch(/\/sdd-workflow|spec\.md/i)
  })

  it('redirect to plan includes the anvil plan command hint', async () => {
    writeState(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature')

    const directive = await resolvePhaseDirective('implementation', TEST_CWD)
    expect(directive.kind).toBe('redirect')
    expect(directive.target).toBe('plan')
    expect(directive.reason).toMatch(/anvil plan|plan\.md/i)
  })
})
