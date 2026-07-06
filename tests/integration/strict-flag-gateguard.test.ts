/**
 * Integration test: --strict flag activates GateGuard (ANVIL_GATEGUARD=1).
 * Plan 39 Phase F.
 *
 * Parameterized across all 4 CLI commands that support --strict:
 *   review, plan, debug, ultra
 *
 * (anvil spec was deleted in ANV-0249 — SDD is now /sdd-workflow skill)
 *
 * For each command, asserts:
 *   1. Calling with strict: true sets process.env.ANVIL_GATEGUARD = '1'.
 *   2. Without strict (and no config), ANVIL_GATEGUARD is NOT '1'.
 *
 * We test only the env-var propagation side (the gateguard.ts unit tests cover
 * the actual gate logic). The CLI commands are called in isolation; they set
 * process.env.ANVIL_GATEGUARD before invoking skill/agent dispatch.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debugCommand } from '../../src/commands/cli/debug.js'
import { reviewCommand } from '../../src/commands/cli/review.js'
import { ultraCommand } from '../../src/commands/cli/ultra.js'

// planCommand with --strict requires a feature slug + spec file; tested separately below

// ─── Setup ───────────────────────────────────────────────────────────────────

let stdoutSpy: ReturnType<typeof vi.spyOn>
let stderrSpy: ReturnType<typeof vi.spyOn>

function clearGateguardEnv() {
  // Reflect.deleteProperty is the lint-safe way to remove process.env keys
  Reflect.deleteProperty(process.env, 'ANVIL_GATEGUARD')
}

beforeEach(() => {
  clearGateguardEnv()
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  stdoutSpy?.mockRestore()
  stderrSpy?.mockRestore()
  clearGateguardEnv()
})

// ─── review ──────────────────────────────────────────────────────────────────

describe('strict-flag-gateguard: anvil review', () => {
  it('sets ANVIL_GATEGUARD=1 when --strict is passed', async () => {
    await reviewCommand(undefined, { strict: true })
    expect(process.env.ANVIL_GATEGUARD).toBe('1')
  })

  it('does NOT set ANVIL_GATEGUARD=1 when --strict is absent', async () => {
    await reviewCommand(undefined, { strict: false })
    expect(process.env.ANVIL_GATEGUARD).not.toBe('1')
  })

  it('emits a GateGuard enabled message to stderr when --strict is passed', async () => {
    await reviewCommand(undefined, { strict: true })
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(stderrOutput).toContain('GateGuard')
  })
})

// ─── debug ────────────────────────────────────────────────────────────────────

describe('strict-flag-gateguard: anvil debug', () => {
  it('sets ANVIL_GATEGUARD=1 when --strict is passed', async () => {
    await debugCommand('test issue', { strict: true })
    expect(process.env.ANVIL_GATEGUARD).toBe('1')
  })

  it('does NOT set ANVIL_GATEGUARD=1 when --strict is absent', async () => {
    await debugCommand('test issue', {})
    expect(process.env.ANVIL_GATEGUARD).not.toBe('1')
  })
})

// ─── ultra ────────────────────────────────────────────────────────────────────

describe('strict-flag-gateguard: anvil ultra', () => {
  it('sets ANVIL_GATEGUARD=1 when --strict is passed', async () => {
    await ultraCommand('test task', { strict: true })
    expect(process.env.ANVIL_GATEGUARD).toBe('1')
  })

  it('does NOT set ANVIL_GATEGUARD=1 when --strict is absent', async () => {
    await ultraCommand('test task', { strict: false })
    expect(process.env.ANVIL_GATEGUARD).not.toBe('1')
  })
})

// ─── plan (with --strict, no feature slug → no-op path) ──────────────────────

describe('strict-flag-gateguard: anvil plan', () => {
  // planCommand reads .anvil/state.json from cwd; isolate to a clean dir so the
  // goal-only fast path is taken (no feature slug → invokeSkill('planning') only,
  // no dispatchPlanVerifier).
  const TEST_CWD_PLAN = join('/tmp', 'gateguard-plan-test')
  let origCwd: string

  beforeEach(() => {
    origCwd = process.cwd()
    rmSync(TEST_CWD_PLAN, { recursive: true, force: true })
    mkdirSync(TEST_CWD_PLAN, { recursive: true })
    process.chdir(TEST_CWD_PLAN)
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(TEST_CWD_PLAN, { recursive: true, force: true })
  })

  it('sets ANVIL_GATEGUARD=1 when planCommand called with strict=true (goal-only path)', async () => {
    const { planCommand } = await import('../../src/commands/cli/plan.js')
    await planCommand('implement feature', { strict: true })
    expect(process.env.ANVIL_GATEGUARD).toBe('1')
  })

  it('does NOT set ANVIL_GATEGUARD=1 on planCommand without --strict', async () => {
    const { planCommand } = await import('../../src/commands/cli/plan.js')
    await planCommand('implement feature', { strict: false })
    expect(process.env.ANVIL_GATEGUARD).not.toBe('1')
  })
})
