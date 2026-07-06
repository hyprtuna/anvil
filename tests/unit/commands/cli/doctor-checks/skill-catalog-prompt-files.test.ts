/**
 * ANV-0179 — `Skill catalog` doctor walker must skip `*-prompt.md` files.
 *
 * The walker inside `pushSkillBehaviorValidationChecks` scans every `.md` file
 * under `skills/` and treats any file NOT loaded by the registry as
 * "invalid frontmatter". That logic incorrectly flagged the 4 ANV-0083
 * collapsed-agent prompt fragments (`*-prompt.md`) as invalid skills. This
 * test pins the fixed behaviour: prompt fragments are excluded from the walk
 * and therefore never appear in the invalid count.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { pushSkillBehaviorValidationChecks } from '../../../../../src/commands/cli/doctor-checks/capability.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

describe('Skill catalog walker skips *-prompt.md files', () => {
  let cwd: string

  beforeEach(() => {
    cwd = createTestTmpDir('skill-catalog-prompt-files')
    // Build a minimal skills/ tree:
    //   skills/universal/example/SKILL.md         ← real subdir-form skill
    //   skills/universal/example/sibling-prompt.md ← prompt fragment (skip)
    const skillDir = join(cwd, 'skills', 'universal', 'example')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
name: example
kind: composite
group: review
description: Use when testing the walker.
preferred_model: balanced
preferred_effort: medium
---

body
`,
    )
    writeFileSync(
      join(skillDir, 'sibling-prompt.md'),
      `# Collapsed-agent prompt fragment

No frontmatter — invoked via Task(general-purpose), not a skill.
`,
    )
  })

  it('does not count *-prompt.md siblings as invalid-frontmatter skills', async () => {
    const checks: Check[] = []
    await pushSkillBehaviorValidationChecks(checks, cwd, true, 'n/a', cwd)
    const catalog = checks.find((c) => c.name === 'Skill catalog')
    expect(catalog).toBeDefined()
    expect(catalog?.status).toBe('pass')
    expect(catalog?.detail).not.toMatch(/invalid frontmatter/)
  })
})
