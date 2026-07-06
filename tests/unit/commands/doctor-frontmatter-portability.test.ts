/**
 * ANV-0209 — Frontmatter portability doctor row.
 *
 * Tests:
 *   1. Happy path: real project tree (agents/ + skills/) passes after ANV-0206 codemod.
 *   2. Clean fixture: passes on a synthetic fixture with only allowed keys.
 *   3. Failure path: fails on a fixture with an unknown root key.
 *   4. Warn path: warns on a fixture with deprecated transitional root keys.
 *   5. Warn path: warns on a fixture with unknown x-anvil sub-keys.
 *   6. Skip: skips when inProject is false.
 */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildFrontmatterPortabilityRow,
  pushFrontmatterPortabilityCheck,
} from '../../../src/commands/cli/doctor-checks/frontmatter-portability.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
}

const ROW_NAME = 'Frontmatter portability'
const CWD = process.cwd()
const FIXTURES = join(CWD, 'tests', 'fixtures')

// ─── buildFrontmatterPortabilityRow (pure builder) ───────────────────────────

describe('buildFrontmatterPortabilityRow — pure builder', () => {
  it('returns pass when there are no offenders', () => {
    const row = buildFrontmatterPortabilityRow({
      scanned: 5,
      unknownRootOffenders: [],
      deprecatedOffenders: [],
      unknownXAnvilOffenders: [],
    })
    expect(row.status).toBe('pass')
    expect(row.detail).toContain('5 file(s)')
    expect(row.name).toBe(ROW_NAME)
  })

  it('returns fail when there are unknown root key offenders', () => {
    const row = buildFrontmatterPortabilityRow({
      scanned: 3,
      unknownRootOffenders: [
        { rel: 'agents/bad.md', keys: ['unknown_root_key'] },
      ],
      deprecatedOffenders: [],
      unknownXAnvilOffenders: [],
    })
    expect(row.status).toBe('fail')
    expect(row.detail).toContain('unknown_root_key')
    expect(row.detail).toContain('agents/bad.md')
  })

  it('returns warn when there are deprecated root key offenders only', () => {
    const row = buildFrontmatterPortabilityRow({
      scanned: 4,
      unknownRootOffenders: [],
      deprecatedOffenders: [
        { rel: 'skills/old.md', keys: ['preferred_model', 'max_tokens'] },
      ],
      unknownXAnvilOffenders: [],
    })
    expect(row.status).toBe('warn')
    expect(row.detail).toContain('deprecated')
    expect(row.detail).toContain('preferred_model')
  })

  it('returns warn when there are unknown x-anvil sub-key offenders only', () => {
    const row = buildFrontmatterPortabilityRow({
      scanned: 2,
      unknownRootOffenders: [],
      deprecatedOffenders: [],
      unknownXAnvilOffenders: [
        { rel: 'agents/xanvil-bad.md', keys: ['totally_unknown_sub'] },
      ],
    })
    expect(row.status).toBe('warn')
    expect(row.detail).toContain('totally_unknown_sub')
  })

  it('prefers fail over warn when both unknown root and deprecated keys exist', () => {
    const row = buildFrontmatterPortabilityRow({
      scanned: 2,
      unknownRootOffenders: [{ rel: 'agents/a.md', keys: ['bad_key'] }],
      deprecatedOffenders: [{ rel: 'skills/b.md', keys: ['max_tokens'] }],
      unknownXAnvilOffenders: [],
    })
    expect(row.status).toBe('fail')
  })
})

// ─── pushFrontmatterPortabilityCheck (I/O wrapper) ───────────────────────────

describe('pushFrontmatterPortabilityCheck — I/O wrapper', () => {
  it('skips when inProject is false', () => {
    const checks: Check[] = []
    pushFrontmatterPortabilityCheck(checks, CWD, false, 'not in project')
    const row = checks.find((c) => c.name === ROW_NAME)
    expect(row).toBeDefined()
    expect(row!.status).toBe('skip')
    expect(row!.expectedAbsence).toBe(true)
  })

  it('does not fail on the real project tree (agents/ + skills/ after)', () => {
    // The Anvil source tree after ANV-0206 codemod should have no unknown root keys.
    // Deprecated transitional keys (preferred_model, preferred_effort, max_tokens,
    // fallback_model) still present in many skills produce 'warn', not 'fail'.
    // Unknown x-anvil sub-keys also produce 'warn'. Neither is 'fail'.
    // This assertion ensures the shipped surface doesn't regress to fail.
    const checks: Check[] = []
    pushFrontmatterPortabilityCheck(checks, CWD, true, 'not in project')
    const row = checks.find((c) => c.name === ROW_NAME)
    expect(row, 'row must exist').toBeDefined()
    expect(
      row!.status,
      `real tree must not fail portability check: ${row!.detail}`,
    ).not.toBe('fail')
  })

  it('passes on the clean synthetic fixture', () => {
    const fixtureDir = join(FIXTURES, 'frontmatter-portability')
    const checks: Check[] = []
    pushFrontmatterPortabilityCheck(
      checks,
      CWD,
      true,
      'not in project',
      join(fixtureDir, 'agents'),
      join(fixtureDir, 'skills'),
    )
    const row = checks.find((c) => c.name === ROW_NAME)
    expect(row).toBeDefined()
    expect(
      row!.status,
      `expected pass on clean fixture but got ${row!.status}: ${row!.detail}`,
    ).toBe('pass')
  })

  it('fails when a fixture has an unknown root key', () => {
    const fixtureDir = join(FIXTURES, 'frontmatter-portability-bad')
    const checks: Check[] = []
    // Only scan the agents dir which has bad-agent.md with unknown_root_key_injected
    pushFrontmatterPortabilityCheck(
      checks,
      CWD,
      true,
      'not in project',
      join(fixtureDir, 'agents'),
      join(fixtureDir, 'skills'), // also has deprecated keys (warn would co-exist)
    )
    const row = checks.find((c) => c.name === ROW_NAME)
    expect(row).toBeDefined()
    expect(row!.status).toBe('fail')
    expect(row!.detail).toContain('unknown_root_key_injected')
  })

  it('warns when a fixture only has deprecated transitional root keys', () => {
    const fixtureDir = join(FIXTURES, 'frontmatter-portability-bad')
    const checks: Check[] = []
    // Scan only the skills/ dir which has deprecated keys (role, tier) but no unknown root keys.
    // ANV-0214: preferred_model/preferred_effort/max_tokens/fallback_model were removed from
    // ROOT_DEPRECATED_ALLOWLIST — the fixture now uses role/tier (still deprecated).
    pushFrontmatterPortabilityCheck(
      checks,
      CWD,
      true,
      'not in project',
      join(fixtureDir, 'agents-does-not-exist'), // non-existent → skipped
      join(fixtureDir, 'skills'),
    )
    const row = checks.find((c) => c.name === ROW_NAME)
    expect(row).toBeDefined()
    expect(row!.status).toBe('warn')
    expect(row!.detail).toContain('deprecated')
  })
})
