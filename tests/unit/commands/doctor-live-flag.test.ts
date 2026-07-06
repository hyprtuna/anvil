/**
 * ANV-0045 — Tests for `anvil doctor --live` flag and fixture-coverage row.
 *
 * Covers:
 *  - `pushSkillFixtureCoverageRow`: static row logic
 *  - `runLiveSkillEval`: gate behaviour (with/without ANVIL_LIVE_EVAL)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decideLiveEval,
  pushSkillFixtureCoverageRow,
  runLiveSkillEval,
} from '../../../src/commands/cli/doctor.js'

type Check = { name: string; status: string; detail: string }

// ---------------------------------------------------------------------------
// pushSkillFixtureCoverageRow
// ---------------------------------------------------------------------------

describe('pushSkillFixtureCoverageRow', () => {
  const tmpDir = `/tmp/anv-0045-fixture-test-${process.pid}`

  beforeEach(() => {
    mkdirSync(join(tmpDir, 'tests', 'skill-triggering', 'fixtures'), {
      recursive: true,
    })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('pass when all user-invocable skills have fixture files', () => {
    const fixturesDir = join(tmpDir, 'tests', 'skill-triggering', 'fixtures')
    writeFileSync(
      join(fixturesDir, 'changelog-generation.md'),
      'prompt',
      'utf-8',
    )
    writeFileSync(join(fixturesDir, 'code-review.md'), 'prompt', 'utf-8')

    const checks: Check[] = []
    pushSkillFixtureCoverageRow(checks, tmpDir, [
      'changelog-generation',
      'code-review',
    ])

    expect(checks).toHaveLength(1)
    expect(checks[0]!.name).toBe('skill-triggering fixture coverage')
    expect(checks[0]!.status).toBe('pass')
    expect(checks[0]!.detail).toContain('2/2')
  })

  it('warn when some user-invocable skills are missing fixture files', () => {
    const fixturesDir = join(tmpDir, 'tests', 'skill-triggering', 'fixtures')
    writeFileSync(
      join(fixturesDir, 'changelog-generation.md'),
      'prompt',
      'utf-8',
    )
    // code-review.md deliberately NOT created

    const checks: Check[] = []
    pushSkillFixtureCoverageRow(checks, tmpDir, [
      'changelog-generation',
      'code-review',
    ])

    expect(checks[0]!.status).toBe('warn')
    expect(checks[0]!.detail).toContain('1/2')
    expect(checks[0]!.detail).toContain('tests/skill-triggering/fixtures/')
  })

  it('warn when no fixture files exist at all', () => {
    const checks: Check[] = []
    pushSkillFixtureCoverageRow(checks, tmpDir, ['debugging', 'planning'])

    expect(checks[0]!.status).toBe('warn')
    expect(checks[0]!.detail).toContain('0/2')
  })

  it('skip when there are no user-invocable skills', () => {
    const checks: Check[] = []
    pushSkillFixtureCoverageRow(checks, tmpDir, [])

    expect(checks[0]!.status).toBe('skip')
  })
})

// ---------------------------------------------------------------------------
// decideLiveEval — --live × tier decision (ANV-0217 follow-up)
// ---------------------------------------------------------------------------

describe('decideLiveEval ( follow-up)', () => {
  it('flags degraded --live at the quick tier (--smoke --live): warn + skip, do not run', () => {
    const d = decideLiveEval({ live: true, runLevel: 'quick' })
    expect(d).toEqual({ run: false, degradedLive: true })
  })

  it('runs the eval for --live at the standard tier', () => {
    const d = decideLiveEval({ live: true, runLevel: 'standard' })
    expect(d).toEqual({ run: true, degradedLive: false })
  })

  it('runs the eval at deep tier even without --live', () => {
    const d = decideLiveEval({ live: false, runLevel: 'deep' })
    expect(d).toEqual({ run: true, degradedLive: false })
  })

  it('runs the eval at diagnostic-dump tier even without --live', () => {
    const d = decideLiveEval({ live: false, runLevel: 'diagnostic-dump' })
    expect(d).toEqual({ run: true, degradedLive: false })
  })

  it('does not run the eval at the quick tier when --live is absent', () => {
    const d = decideLiveEval({ live: false, runLevel: 'quick' })
    expect(d).toEqual({ run: false, degradedLive: false })
  })

  it('does not run the eval at the standard tier when --live is absent', () => {
    const d = decideLiveEval({ live: false, runLevel: 'standard' })
    expect(d).toEqual({ run: false, degradedLive: false })
  })
})

// ---------------------------------------------------------------------------
// runLiveSkillEval — gate behaviour
// ---------------------------------------------------------------------------

describe('runLiveSkillEval', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  const origEnv = process.env.ANVIL_LIVE_EVAL

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (origEnv === undefined) {
      process.env.ANVIL_LIVE_EVAL = undefined
    } else {
      process.env.ANVIL_LIVE_EVAL = origEnv
    }
  })

  it('prints gate message when ANVIL_LIVE_EVAL is not set', async () => {
    process.env.ANVIL_LIVE_EVAL = undefined
    await runLiveSkillEval(['changelog-generation'], '/tmp/nonexistent')
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('ANVIL_LIVE_EVAL=1')
  })

  it('prints gate message when ANVIL_LIVE_EVAL=0', async () => {
    process.env.ANVIL_LIVE_EVAL = '0'
    await runLiveSkillEval(['changelog-generation'], '/tmp/nonexistent')
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('ANVIL_LIVE_EVAL=1')
  })

  it('reports pass for skills with fixture files when ANVIL_LIVE_EVAL=1', async () => {
    const tmpDir = `/tmp/anv-0045-live-eval-${process.pid}`
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(join(tmpDir, 'changelog-generation.md'), 'prompt', 'utf-8')

    process.env.ANVIL_LIVE_EVAL = '1'
    await runLiveSkillEval(['changelog-generation'], tmpDir)
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('pass')
    expect(output).toContain('changelog-generation')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reports warn for skills missing fixture files when ANVIL_LIVE_EVAL=1', async () => {
    process.env.ANVIL_LIVE_EVAL = '1'
    await runLiveSkillEval(
      ['no-fixture-skill'],
      '/tmp/definitely-does-not-exist',
    )
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('warn')
    expect(output).toContain('no-fixture-skill')
  })
})
