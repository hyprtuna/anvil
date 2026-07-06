import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  pushTemplateEmbeddedLintCheck,
  pushTemplateUserOverridesCheck,
} from '../../../../../src/commands/cli/doctor-checks/templates.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

describe('doctor — templates/user-overrides-loaded', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('anvil-doctor-tpl')
  })

  it('skip when userRoot does not exist', () => {
    const checks: Check[] = []
    pushTemplateUserOverridesCheck(checks, join(tmp, 'absent'))
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('skip')
    expect(checks[0].name).toBe('templates/user-overrides-loaded')
  })

  it('pass + "none" when no overrides are present', () => {
    mkdirSync(join(tmp, 'templates'), { recursive: true })
    const checks: Check[] = []
    pushTemplateUserOverridesCheck(checks, tmp)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toBe('none')
    expect(checks[0].expectedAbsence).toBe(true)
  })

  it('pass + summary when overrides are present', () => {
    mkdirSync(join(tmp, 'templates', 'decisions'), { recursive: true })
    writeFileSync(join(tmp, 'templates', 'decisions', 'default.md'), '')
    writeFileSync(join(tmp, 'templates', 'decisions', 'opencode.md'), '')
    const checks: Check[] = []
    pushTemplateUserOverridesCheck(checks, tmp)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toMatch(/2 override\(s\)/)
    expect(checks[0].detail).toContain('decisions/default.md')
    expect(checks[0].detail).toContain('decisions/opencode.md')
  })
})

describe('doctor — templates/embedded-prose-lint', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('anvil-doctor-emb')
  })

  it('skip when skills/ does not exist', () => {
    const checks: Check[] = []
    pushTemplateEmbeddedLintCheck(checks, tmp)
    expect(checks[0].status).toBe('skip')
  })

  it('pass when no skill carries the marker', () => {
    mkdirSync(join(tmp, 'skills', 'universal'), { recursive: true })
    writeFileSync(
      join(tmp, 'skills', 'universal', 'plain.md'),
      '---\nname: plain\n---\n\nplain body',
    )
    const checks: Check[] = []
    pushTemplateEmbeddedLintCheck(checks, tmp)
    expect(checks[0].status).toBe('pass')
  })

  it('warn when a skill carries the marker without templates: frontmatter', () => {
    mkdirSync(join(tmp, 'skills', 'universal'), { recursive: true })
    writeFileSync(
      join(tmp, 'skills', 'universal', 'offender.md'),
      '---\nname: offender\n---\n\n<!-- template-prose -->\nblock body',
    )
    const checks: Check[] = []
    pushTemplateEmbeddedLintCheck(checks, tmp)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('offender.md')
  })

  it('pass when a skill carries the marker AND declares templates:', () => {
    mkdirSync(join(tmp, 'skills', 'universal'), { recursive: true })
    writeFileSync(
      join(tmp, 'skills', 'universal', 'migrated.md'),
      '---\nname: migrated\ntemplates: [decisions]\n---\n\n<!-- template-prose -->\n${TEMPLATE:decisions}',
    )
    const checks: Check[] = []
    pushTemplateEmbeddedLintCheck(checks, tmp)
    expect(checks[0].status).toBe('pass')
  })
})

// ─── ANV-0136 decision-template/skills-using-it row ────────────────────────

import { pushDecisionTemplateSkillsCheck } from '../../../../../src/commands/cli/doctor-checks/templates.js'

describe('doctor — decision-template/skills-using-it', () => {
  let tmp: string
  beforeEach(() => {
    tmp = createTestTmpDir('anvil-doctor-dt')
  })
  it('skip when skills/ directory does not exist', () => {
    const checks: Check[] = []
    pushDecisionTemplateSkillsCheck(checks, tmp)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('skip')
    expect(checks[0].name).toBe('decision-template/skills-using-it')
  })

  it('pass + "none" when no skills reference ${TEMPLATE:decisions}', () => {
    mkdirSync(join(tmp, 'skills', 'universal'), { recursive: true })
    writeFileSync(
      join(tmp, 'skills', 'universal', 'noop.md'),
      '---\nname: noop\n---\nbody without the token',
    )
    const checks: Check[] = []
    pushDecisionTemplateSkillsCheck(checks, tmp)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toBe('none')
    expect(checks[0].expectedAbsence).toBe(true)
  })

  it('pass + sorted list when one or more skills consume the token', () => {
    mkdirSync(join(tmp, 'skills', 'universal'), { recursive: true })
    writeFileSync(
      join(tmp, 'skills', 'universal', 'beta.md'),
      '---\nname: beta\n---\nuses ${TEMPLATE:decisions} here',
    )
    writeFileSync(
      join(tmp, 'skills', 'universal', 'alpha.md'),
      '---\nname: alpha\n---\nuses ${TEMPLATE:decisions} too',
    )
    writeFileSync(
      join(tmp, 'skills', 'universal', 'gamma.md'),
      '---\nname: gamma\n---\nno token',
    )
    const checks: Check[] = []
    pushDecisionTemplateSkillsCheck(checks, tmp)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('2 skill(s):')
    // Sorted: alpha before beta.
    const idxAlpha = checks[0].detail.indexOf('alpha.md')
    const idxBeta = checks[0].detail.indexOf('beta.md')
    expect(idxAlpha).toBeGreaterThan(-1)
    expect(idxBeta).toBeGreaterThan(idxAlpha)
    expect(checks[0].detail).not.toContain('gamma.md')
  })
})
