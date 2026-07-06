/**
 * ANV-0186 — Tests for cwd-hardcoding fixes in skill-checks.ts
 *
 * Two bugs fixed:
 * 1. `skill registry health` row: when cwd/skills doesn't exist, should fall
 *    back to anvilHome/skills rather than skipping.
 * 2. `Skill loading mode` row: uses process.cwd() instead of anvilHome for
 *    skill-count totals in lazy mode. Should use anvilHome/skills fallback.
 *
 * Scenarios tested:
 * - User-install: no skills/ in cwd, populated ~/.anvil/skills/ (anvilHome)
 * - Contributor: cwd has skills/ — legacy behavior unchanged
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pushSkillLoadingModeCheck,
  pushSkillRegistryChecks,
} from '../../../../../src/commands/cli/doctor-checks/skill-checks.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

type Check = {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
}

// Minimal SKILL.md content for test skills (all required fields per SkillFrontmatter schema)
function minimalSkillMd(name: string): string {
  return [
    '---',
    `name: ${name}`,
    'kind: atomic',
    'group: test',
    'description: Test skill for ANV-0186 cwd-fallback tests',
    'preferred_model: balanced',
    'preferred_effort: low',
    'tags: [test]',
    'user-invocable: false',
    '---',
    '',
    '# Body of skill',
  ].join('\n')
}

function makeSkillDir(root: string, name: string): void {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), minimalSkillMd(name))
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let tmpCwd: string
let tmpAnvilHome: string

beforeEach(() => {
  tmpCwd = createTestTmpDir('anv0186-cwd')
  tmpAnvilHome = createTestTmpDir('anv0186-home')
})

afterEach(() => {
  rmSync(tmpCwd, { recursive: true, force: true })
  rmSync(tmpAnvilHome, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// pushSkillRegistryChecks — skill registry health row
// ---------------------------------------------------------------------------

describe('pushSkillRegistryChecks — cwd fallback', () => {
  it('user-install scenario: falls back to anvilHome/skills when cwd/skills is absent', async () => {
    // Populate anvilHome/skills with two skills
    const anvilSkillsRoot = join(tmpAnvilHome, 'skills')
    mkdirSync(anvilSkillsRoot, { recursive: true })
    makeSkillDir(anvilSkillsRoot, 'skill-alpha')
    makeSkillDir(anvilSkillsRoot, 'skill-beta')

    // tmpCwd has NO skills/ directory (simulates running from ~/)
    const checks: Check[] = []
    await pushSkillRegistryChecks(checks, tmpCwd, tmpAnvilHome, () => {})

    // When skills are found via anvilHome fallback, the skip row must NOT appear
    const skipRow = checks.find(
      (c) => c.name === 'skill registry health' && c.status === 'skip',
    )
    expect(skipRow).toBeUndefined()

    // The uniqueness row is pushed in the success path (no dupes = pass)
    const uniquenessRow = checks.find((c) => c.name === 'skill name uniqueness')
    expect(uniquenessRow?.status).toBe('pass')
    expect(uniquenessRow?.detail).toContain('2 unique')
  })

  it('user-install scenario: when neither cwd/skills nor anvilHome/skills exists, emits clear message', async () => {
    // Neither location has skills/
    const checks: Check[] = []
    await pushSkillRegistryChecks(checks, tmpCwd, tmpAnvilHome, () => {})

    const registryRow = checks.find((c) => c.name === 'skill registry health')
    // Should still skip but with a clear message referencing both locations
    expect(registryRow?.status).toBe('skip')
    // Detail should indicate that neither location has skills
    expect(registryRow?.detail).toMatch(/no skills\//i)
  })

  it('contributor scenario: uses cwd/skills when present (behavior unchanged)', async () => {
    // Populate cwd/skills
    const cwdSkillsRoot = join(tmpCwd, 'skills')
    mkdirSync(cwdSkillsRoot, { recursive: true })
    makeSkillDir(cwdSkillsRoot, 'contrib-skill')

    // Also populate anvilHome/skills (should be ignored)
    const anvilSkillsRoot = join(tmpAnvilHome, 'skills')
    mkdirSync(anvilSkillsRoot, { recursive: true })
    makeSkillDir(anvilSkillsRoot, 'global-skill')

    const checks: Check[] = []
    await pushSkillRegistryChecks(checks, tmpCwd, tmpAnvilHome, () => {})

    // No skip row — skills were found in cwd/skills
    const skipRow = checks.find(
      (c) => c.name === 'skill registry health' && c.status === 'skip',
    )
    expect(skipRow).toBeUndefined()

    // Uniqueness row should reflect only cwd skills (1 skill, not 2)
    const uniquenessRow = checks.find((c) => c.name === 'skill name uniqueness')
    expect(uniquenessRow?.status).toBe('pass')
    expect(uniquenessRow?.detail).toContain('1 unique')
  })
})

// ---------------------------------------------------------------------------
// pushSkillLoadingModeCheck — skill loading mode totals
// ---------------------------------------------------------------------------

describe('pushSkillLoadingModeCheck — cwd fallback', () => {
  it('user-install scenario: counts skills from anvilHome/skills when lazy mode and cwd/skills absent', async () => {
    // Enable lazy mode via models.json in anvilHome
    const modelsJson = { skills: { lazy_load: true } }
    writeFileSync(join(tmpAnvilHome, 'models.json'), JSON.stringify(modelsJson))

    // Populate anvilHome/skills
    const anvilSkillsRoot = join(tmpAnvilHome, 'skills')
    mkdirSync(anvilSkillsRoot, { recursive: true })
    makeSkillDir(anvilSkillsRoot, 'lazy-skill-one')
    makeSkillDir(anvilSkillsRoot, 'lazy-skill-two')
    makeSkillDir(anvilSkillsRoot, 'lazy-skill-three')

    // tmpCwd has no skills/ — simulates user running from ~/
    // Mock process.cwd() to return our tmpCwd so the old bug would return 0
    vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd)

    const checks: Check[] = []
    await pushSkillLoadingModeCheck(checks, tmpAnvilHome)

    const modeRow = checks.find((c) => c.name.startsWith('Skill loading mode'))
    expect(modeRow?.status).toBe('pass')
    // With the fix, should show 3 (from anvilHome/skills) not 0
    expect(modeRow?.detail).toContain('/3')
  })

  it('contributor scenario: counts skills from cwd/skills when present (lazy mode)', async () => {
    // Enable lazy mode
    const modelsJson = { skills: { lazy_load: true } }
    writeFileSync(join(tmpAnvilHome, 'models.json'), JSON.stringify(modelsJson))

    // Populate cwd/skills (contributor tree)
    const cwdSkillsRoot = join(tmpCwd, 'skills')
    mkdirSync(cwdSkillsRoot, { recursive: true })
    makeSkillDir(cwdSkillsRoot, 'contrib-skill-a')
    makeSkillDir(cwdSkillsRoot, 'contrib-skill-b')

    vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd)

    const checks: Check[] = []
    await pushSkillLoadingModeCheck(checks, tmpAnvilHome)

    const modeRow = checks.find((c) => c.name.startsWith('Skill loading mode'))
    expect(modeRow?.status).toBe('pass')
    // Should show 2 skills from cwd
    expect(modeRow?.detail).toContain('/2')
  })

  it('eager mode: still passes without counting skills (behavior unchanged)', async () => {
    // No models.json → eager mode (default)
    const checks: Check[] = []
    await pushSkillLoadingModeCheck(checks, tmpAnvilHome)

    const modeRow = checks.find((c) => c.name.startsWith('Skill loading mode'))
    expect(modeRow?.status).toBe('pass')
    expect(modeRow?.detail).toContain('eager')
  })
})
