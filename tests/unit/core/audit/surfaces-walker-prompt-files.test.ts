/**
 * ANV-0179 — surfaces audit walker must skip `*-prompt.md` files.
 *
 * `*-prompt.md` siblings of a `SKILL.md` are ANV-0083 collapsed-agent prompt
 * fragments invoked via `Task(general-purpose)`. They are not skills and they
 * are intentionally not loaded by the skill loader. The audit walker should
 * honor the same convention and ignore them so the dimension-drift matrix
 * does not count prompt fragments as drifted surfaces.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditTree } from '../../../../src/core/audit/surfaces.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('auditTree walker skips *-prompt.md files', () => {
  let cwd: string

  beforeEach(() => {
    cwd = createTestTmpDir('audit-walker-prompt-files')
    // Fake skill-tree:
    //   skills/universal/example/SKILL.md          ← real skill
    //   skills/universal/example/helper-prompt.md  ← prompt fragment (should be skipped)
    const skillDir = join(cwd, 'skills', 'universal', 'example')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
name: example
description: Use when testing.
---

# example

body
`,
    )
    writeFileSync(
      join(skillDir, 'helper-prompt.md'),
      `# Collapsed-agent prompt fragment

This is invoked via Task(general-purpose), not as a skill.
No frontmatter on purpose.
`,
    )
  })

  it('enumerates SKILL.md but excludes the sibling *-prompt.md fragment', () => {
    const matrix = auditTree({ cwd })
    const paths = matrix.rows.map((r) => r.path)
    expect(paths.some((p) => p.endsWith('SKILL.md'))).toBe(true)
    expect(paths.some((p) => p.endsWith('-prompt.md'))).toBe(false)
  })

  it('counts the prompt file neither as a skill nor as a flagged dimension', () => {
    const matrix = auditTree({ cwd })
    expect(matrix.counts.skill).toBe(1)
    // No row corresponds to the prompt file, so its dimensions cannot flag.
    for (const row of matrix.rows) {
      expect(row.path.endsWith('-prompt.md')).toBe(false)
    }
  })
})
