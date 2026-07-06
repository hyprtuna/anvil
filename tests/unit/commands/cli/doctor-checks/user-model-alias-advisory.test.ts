/**
 * ANV-0221 follow-up — user-config concrete-model-ID advisory.
 *
 * The concrete-id allowlist unit test (concrete-id-allowlist.test.ts) covers
 * src/ + presets/ but CANNOT read a user's `~/.anvil/models.json`. That
 * user-facing WARN was lost when ANV-0221 deleted the inline doctor rows; this
 * suite covers the restored, warn-only advisory.
 *
 * Tests are deterministic — the pure detector takes a parsed object, and the
 * push function reads a temp `models.json` from an isolated `anvilHome`.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  collectUserConfigConcreteModelIds,
  pushUserModelAliasAdvisoryCheck,
} from '../../../../../src/commands/cli/doctor-checks/architecture.js'

type Check = { name: string; status: string; detail: string }

// ---------------------------------------------------------------------------
// collectUserConfigConcreteModelIds — pure detector
// ---------------------------------------------------------------------------

describe('collectUserConfigConcreteModelIds', () => {
  it('returns [] for non-objects', () => {
    expect(collectUserConfigConcreteModelIds(null)).toEqual([])
    expect(collectUserConfigConcreteModelIds('x')).toEqual([])
    expect(collectUserConfigConcreteModelIds([])).toEqual([])
  })

  it('returns [] when only provider-neutral aliases are used', () => {
    const cfg = {
      defaults: { default: 'balanced' },
      tiers: { coding: { model: 'balanced' } },
      agents: { 'code-reviewer': { model: 'best' } },
      overrides: { debugging: 'cheap' },
    }
    expect(collectUserConfigConcreteModelIds(cfg)).toEqual([])
  })

  it('flags a concrete ID in defaults.default', () => {
    const cfg = { defaults: { default: 'claude-sonnet-4-6' } }
    expect(collectUserConfigConcreteModelIds(cfg)).toEqual([
      'claude-sonnet-4-6',
    ])
  })

  it('flags concrete IDs in tiers, agents, and overrides', () => {
    const cfg = {
      tiers: { coding: { model: 'claude-sonnet-4-6' } },
      agents: { planner: { model: 'claude-opus-4-7' } },
      overrides: { debugging: { model: 'claude-haiku-4-5' } },
    }
    expect(collectUserConfigConcreteModelIds(cfg)).toEqual([
      'claude-haiku-4-5',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
    ])
  })

  it('flags a concrete ID in a string-valued override', () => {
    const cfg = { overrides: { debugging: 'claude-opus-4-7' } }
    expect(collectUserConfigConcreteModelIds(cfg)).toEqual(['claude-opus-4-7'])
  })

  it('does NOT flag concrete IDs inside model_aliases (the resolution target)', () => {
    const cfg = {
      model_aliases: {
        cheap: 'claude-haiku-4-5',
        balanced: 'claude-sonnet-4-6',
        best: 'claude-opus-4-7',
      },
      defaults: { default: 'balanced' },
    }
    expect(collectUserConfigConcreteModelIds(cfg)).toEqual([])
  })

  it('de-dupes repeated concrete IDs', () => {
    const cfg = {
      defaults: { default: 'claude-sonnet-4-6' },
      tiers: { coding: { model: 'claude-sonnet-4-6' } },
    }
    expect(collectUserConfigConcreteModelIds(cfg)).toEqual([
      'claude-sonnet-4-6',
    ])
  })
})

// ---------------------------------------------------------------------------
// pushUserModelAliasAdvisoryCheck — doctor row
// ---------------------------------------------------------------------------

describe('pushUserModelAliasAdvisoryCheck', () => {
  let anvilHome: string

  beforeEach(() => {
    anvilHome = join(
      tmpdir(),
      `anvil-user-model-advisory-${process.pid}-${Date.now()}`,
    )
    mkdirSync(anvilHome, { recursive: true })
  })

  afterEach(() => {
    rmSync(anvilHome, { recursive: true, force: true })
  })

  function writeModels(obj: unknown): void {
    writeFileSync(join(anvilHome, 'models.json'), JSON.stringify(obj), 'utf-8')
  }

  it('skips when ~/.anvil/models.json is absent', () => {
    const checks: Check[] = []
    pushUserModelAliasAdvisoryCheck(checks, anvilHome)
    expect(checks).toHaveLength(1)
    expect(checks[0]!.status).toBe('skip')
  })

  it('passes when the user config uses only aliases', () => {
    writeModels({ defaults: { default: 'balanced' } })
    const checks: Check[] = []
    pushUserModelAliasAdvisoryCheck(checks, anvilHome)
    expect(checks[0]!.status).toBe('pass')
  })

  it('warns (never fails) when concrete model IDs are pinned', () => {
    writeModels({ defaults: { default: 'claude-sonnet-4-6' } })
    const checks: Check[] = []
    pushUserModelAliasAdvisoryCheck(checks, anvilHome)
    expect(checks[0]!.status).toBe('warn')
    expect(checks[0]!.detail).toContain('claude-sonnet-4-6')
    // Never a fail — this advisory must not block doctor.
    expect(checks[0]!.status).not.toBe('fail')
  })

  it('skips on unparseable JSON (handled by the models.json reference row)', () => {
    writeFileSync(join(anvilHome, 'models.json'), '{ not json', 'utf-8')
    const checks: Check[] = []
    pushUserModelAliasAdvisoryCheck(checks, anvilHome)
    expect(checks[0]!.status).toBe('skip')
  })
})
