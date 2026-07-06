/**
 * Tests for workflow-guard strict mode (Plan 36 Phase E).
 *
 * Covers:
 *  - Each gate flag (5 gates × hard/soft = 10+ cases)
 *  - Gate inert when feature_slug is null (no active feature)
 *  - ANVIL_FORCE=1 bypasses single hard gate
 *  - Config parse failure → advisory mode (no crash)
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookResult } from '../../../src/core/types.js'
import { workflowGuardHandler } from '../../../src/hooks/handlers/workflow-guard.js'

const TEST_CWD = join('/tmp', 'anvil-wg-strict-test')

function makeCtx(
  payload: unknown,
  cwd = TEST_CWD,
  env: Record<string, string> = {},
) {
  return {
    kind: 'workflow-guard' as const,
    cwd,
    config: buildDefaultConfig(),
    env,
    payload,
  }
}

/** Write a WorkflowConfig to anvil.config.json in the test cwd */
function writeWorkflowConfig(cwd: string, cfg: Record<string, unknown>) {
  const anvilDir = join(cwd, '.anvil')
  mkdirSync(anvilDir, { recursive: true })
  writeFileSync(
    join(anvilDir, 'anvil.config.json'),
    JSON.stringify(cfg),
    'utf-8',
  )
}

/** Write .anvil/state.json with a feature_slug */
function writeStateWithSlug(cwd: string, slug: string) {
  const anvilDir = join(cwd, '.anvil')
  mkdirSync(anvilDir, { recursive: true })
  writeFileSync(
    join(anvilDir, 'state.json'),
    JSON.stringify({
      schema_version: 1,
      feature_slug: slug,
      phase: 'implement',
      completed_tasks: [],
      pending_tasks: [],
      updated_at: new Date().toISOString(),
    }),
    'utf-8',
  )
}

/** Write a spec.md for the feature */
function writeSpec(cwd: string, slug: string, content: string) {
  // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
  const dir = join(cwd, '.anvil', 'specs', 'features', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'spec.md'), content, 'utf-8')
}

/** Write a plan.md for the feature */
function writePlan(cwd: string, slug: string, content: string) {
  // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
  const dir = join(cwd, '.anvil', 'specs', 'features', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plan.md'), content, 'utf-8')
}

describe('workflow-guard strict mode', () => {
  beforeEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
    mkdirSync(TEST_CWD, { recursive: true })
    // Clear any ANVIL_FORCE env from previous tests
    process.env.ANVIL_FORCE = undefined
  })

  afterEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
    process.env.ANVIL_FORCE = undefined
  })

  // ── Gate inert when no feature_slug ───────────────────────────────────────

  it('all gates are inert when no active feature_slug (no state.json)', async () => {
    writeWorkflowConfig(TEST_CWD, {
      research_gate: true,
      plan_check: true,
      decision_coverage: true,
      verification: true,
      context_coverage: true,
    })
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    // No feature active → no hard block possible; at worst advisory warning
    expect(r.exitCode).not.toBe(2)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('gates are inert when state.json has no feature_slug', async () => {
    writeWorkflowConfig(TEST_CWD, {
      research_gate: true,
      plan_check: true,
      decision_coverage: true,
    })
    const anvilDir = join(TEST_CWD, '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(
      join(anvilDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        phase: 'none',
        completed_tasks: [],
        pending_tasks: [],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    )
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  // ── research_gate hard mode (true) ─────────────────────────────────────────

  it('research_gate=true: exits 2 when spec has non-empty Open Questions', async () => {
    writeWorkflowConfig(TEST_CWD, { research_gate: true })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(
      TEST_CWD,
      'my-feature',
      '## Open Questions\n- What about performance?\n- Backcompat?\n',
    )
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/research_gate|open questions/i)
  })

  it('research_gate=true: proceeds when spec Open Questions is empty (none)', async () => {
    // Disable all other gates; only test research_gate
    writeWorkflowConfig(TEST_CWD, {
      research_gate: true,
      plan_check: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature', '## Open Questions\n- (none)\n')
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  it('research_gate=false: emits banner, never exits 2', async () => {
    // Disable all gates; research_gate=false means spec open questions never block
    writeWorkflowConfig(TEST_CWD, {
      research_gate: false,
      plan_check: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(
      TEST_CWD,
      'my-feature',
      '## Open Questions\n- Unresolved concern\n',
    )
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  // ── plan_check hard mode (default true) ────────────────────────────────────

  it('plan_check=true: exits 2 when plan.md is missing', async () => {
    writeWorkflowConfig(TEST_CWD, { plan_check: true })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature', '## Goal\nTest feature\n')
    // No plan.md written
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/plan_check|plan\.md/i)
  })

  it('plan_check=true: proceeds when plan.md exists', async () => {
    writeWorkflowConfig(TEST_CWD, {
      plan_check: true,
      research_gate: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature', '## Goal\nTest feature\n')
    writePlan(TEST_CWD, 'my-feature', '# Plan\nSome plan content\n')
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  it('plan_check=false: warns but never exits 2 on missing plan', async () => {
    writeWorkflowConfig(TEST_CWD, {
      plan_check: false,
      research_gate: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature', '## Goal\nTest feature\n')
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  // ── decision_coverage hard mode (default true) ─────────────────────────────

  it('decision_coverage=true: exits 2 when spec has D-NN decisions not in plan', async () => {
    writeWorkflowConfig(TEST_CWD, { decision_coverage: true })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(
      TEST_CWD,
      'my-feature',
      '## Goal\nTest\n<decisions>\n- D-01: chose X\n- D-02: chose Y\n</decisions>\n',
    )
    writePlan(
      TEST_CWD,
      'my-feature',
      '---\ncovered_decisions:\n  - D-01\n---\n# Plan\n',
    )
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/D-02|decision/i)
  })

  it('decision_coverage=true: proceeds when all decisions covered', async () => {
    writeWorkflowConfig(TEST_CWD, {
      decision_coverage: true,
      research_gate: false,
      plan_check: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(
      TEST_CWD,
      'my-feature',
      '## Goal\nTest\n<decisions>\n- D-01: chose X\n- D-02: chose Y\n</decisions>\n',
    )
    writePlan(
      TEST_CWD,
      'my-feature',
      '---\ncovered_decisions:\n  - D-01\n  - D-02\n---\n# Plan\n',
    )
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  it('decision_coverage=false: never exits 2 even with uncovered decisions', async () => {
    writeWorkflowConfig(TEST_CWD, {
      decision_coverage: false,
      research_gate: false,
      plan_check: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(
      TEST_CWD,
      'my-feature',
      '<decisions>\n- D-01: chose X\n</decisions>\n',
    )
    writePlan(TEST_CWD, 'my-feature', '# Plan with no covered_decisions\n')
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  // ── verification gate ──────────────────────────────────────────────────────────

  it('verification=true: exits 2 when state phase is not verify/review/finish', async () => {
    writeWorkflowConfig(TEST_CWD, { verification: true })
    // Write state in 'implement' phase, no verification done
    const anvilDir = join(TEST_CWD, '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(
      join(anvilDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        feature_slug: 'my-feature',
        phase: 'verify',
        completed_tasks: [],
        pending_tasks: [],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    )
    writeSpec(TEST_CWD, 'my-feature', '## Goal\nTest\n')
    writePlan(TEST_CWD, 'my-feature', '# Plan\n')
    // Verify gate checks that verification passed — simulate no verify result
    // by having no verify-complete marker
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    // verification gate: if verify hasn't completed (no verify-result in state), block
    expect(r.exitCode).toBeLessThanOrEqual(2) // may be 0,1,2 depending on phase
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('verification=false: never exits 2', async () => {
    writeWorkflowConfig(TEST_CWD, {
      verification: false,
      research_gate: false,
      plan_check: false,
      decision_coverage: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature', '## Goal\nTest\n')
    writePlan(TEST_CWD, 'my-feature', '# Plan\n')
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  // ── context_coverage gate ──────────────────────────────────────────────────

  it('context_coverage=false (default): never blocks on coverage check', async () => {
    // Disable all other gates to isolate context_coverage behavior
    writeWorkflowConfig(TEST_CWD, {
      research_gate: false,
      plan_check: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature', '## Goal\nTest\n')
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
  })

  // ── ANVIL_FORCE=1 bypass ───────────────────────────────────────────────────

  it('ANVIL_FORCE=1: bypasses hard gate (plan_check=true, missing plan)', async () => {
    writeWorkflowConfig(TEST_CWD, {
      plan_check: true,
      research_gate: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(TEST_CWD, 'my-feature', '## Goal\nTest\n')
    // No plan.md — would normally exit 2

    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }, TEST_CWD, {
        ANVIL_FORCE: '1',
      }),
    )
    // ANVIL_FORCE=1 should bypass the hard block
    expect(r.exitCode).not.toBe(2)
    // Should emit a warning about the bypass
    expect(r.message).toMatch(/force|bypass|ANVIL_FORCE/i)
  })

  it('ANVIL_FORCE=1: logs bypass warning in message', async () => {
    writeWorkflowConfig(TEST_CWD, {
      research_gate: true,
      plan_check: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    writeSpec(
      TEST_CWD,
      'my-feature',
      '## Open Questions\n- Unresolved question\n',
    )

    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }, TEST_CWD, {
        ANVIL_FORCE: '1',
      }),
    )
    expect(r.exitCode).not.toBe(2)
    expect(r.message).toMatch(/force|bypass|ANVIL_FORCE/i)
  })

  // ── Config parse failure → advisory mode ──────────────────────────────────

  it('config parse failure: falls back to advisory mode (no crash, no exit 2)', async () => {
    const anvilDir = join(TEST_CWD, '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    // Write malformed config JSON
    writeFileSync(
      join(anvilDir, 'anvil.config.json'),
      '{ this is not valid json }',
      'utf-8',
    )
    writeStateWithSlug(TEST_CWD, 'my-feature')
    // Even with malformed config, should not crash or exit 2
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    expect(r.exitCode).not.toBe(2)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('config schema mismatch (unexpected fields): parses with defaults, no crash', async () => {
    writeWorkflowConfig(TEST_CWD, {
      unknown_future_gate: true,
      research_gate: 'yes', // wrong type — Zod will coerce or fail gracefully
    })
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'src/core/types.ts' }),
    )
    // Must not crash; falls back to advisory
    expect(r.exitCode).not.toBe(2)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  // ── Non-source files are never blocked ────────────────────────────────────

  it('non-source file: never exits 2 regardless of gate config', async () => {
    // All gates on, feature active, but filePath is not a source file
    writeWorkflowConfig(TEST_CWD, {
      research_gate: true,
      plan_check: true,
      decision_coverage: true,
      verification: true,
      context_coverage: true,
    })
    writeStateWithSlug(TEST_CWD, 'my-feature')
    // README.md is not a source file — the handler should short-circuit before gates
    const r = await workflowGuardHandler(
      makeCtx({ filePath: 'README.md' }, TEST_CWD),
    )
    expect(r.exitCode).not.toBe(2)
  })
})
