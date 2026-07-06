/**
 * ANV-0122 + ANV-0123 — doctor rows for activation adoption and skill
 * shadowing. The check is wired into pushSkillProvidersCheck and pushes
 * three rows (Skill providers + activation + skill-shadow).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushSkillProvidersCheck } from '../../../../src/commands/cli/doctor-checks/plugin.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  alwaysVisible?: boolean
}

function writeSkill(dir: string, slug: string, body = '', extraFm = ''): void {
  mkdirSync(dir, { recursive: true })
  const content = `---
name: ${slug}
kind: atomic
group: development
description: doctor row test ${slug}
preferred_model: claude-sonnet-4-6
preferred_effort: medium
${extraFm}---

${body || `# ${slug} body`}
`
  writeFileSync(join(dir, `${slug}.md`), content)
}

describe('doctor — anv-0122 + anv-0123 rows', () => {
  let work: string
  let prevAnvilHome: string | undefined

  beforeEach(() => {
    work = createTestTmpDir('anv-doctor-rows')
    prevAnvilHome = process.env.ANVIL_HOME
    process.env.ANVIL_HOME = join(work, 'home-anvil')
  })

  afterEach(() => {
    if (prevAnvilHome === undefined) {
      Reflect.deleteProperty(process.env, 'ANVIL_HOME')
    } else {
      process.env.ANVIL_HOME = prevAnvilHome
    }
    rmSync(work, { recursive: true, force: true })
  })

  it('emits an activation row (always visible) when skills/ exists', async () => {
    writeSkill(join(work, 'skills', 'universal'), 'plain')
    writeSkill(
      join(work, 'skills', 'universal'),
      'gated',
      '',
      'activation:\n  languages: ["python"]\n',
    )
    const checks: Check[] = []
    await pushSkillProvidersCheck(checks, work)
    const activation = checks.find((c) => c.name === 'activation')
    expect(activation).toBeDefined()
    expect(activation?.alwaysVisible).toBe(true)
    expect(activation?.status).toBe('pass')
    expect(activation?.detail).toContain('1 of')
    expect(activation?.detail).toContain('activation-block')
  })

  it('emits skill-shadow row (pass) when no significant shadows', async () => {
    writeSkill(join(work, 'skills', 'universal'), 'unique-skill')
    const checks: Check[] = []
    await pushSkillProvidersCheck(checks, work)
    const shadowRow = checks.find((c) => c.name === 'skill-shadow')
    expect(shadowRow).toBeDefined()
    expect(shadowRow?.alwaysVisible).toBe(true)
    expect(shadowRow?.status).toBe('pass')
    expect(shadowRow?.detail).toMatch(/no cross-scope shadows/)
  })

  it('emits skill-shadow row (warn) when Project shadows Bundled', async () => {
    writeSkill(join(work, '.claude', 'skills'), 'duped', '# project')
    writeSkill(join(work, 'skills', 'universal'), 'duped', '# bundled')
    const checks: Check[] = []
    await pushSkillProvidersCheck(checks, work)
    const shadowRow = checks.find((c) => c.name === 'skill-shadow')
    expect(shadowRow).toBeDefined()
    expect(shadowRow?.status).toBe('warn')
    expect(shadowRow?.detail).toMatch(/duped/)
    expect(shadowRow?.detail).toMatch(/Project/)
    expect(shadowRow?.detail).toMatch(/Bundled/)
    expect(shadowRow?.detail).toMatch(/--allow-shadow/)
  })
})
