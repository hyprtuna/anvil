/**
 * ANV-0122 — schema-level integration: skills with and without the
 * `activation:` block must both parse and load cleanly.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadSkillFile } from '../../../src/skills/loader.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('skills/loader — activation block', () => {
  let work: string

  beforeEach(() => {
    work = createTestTmpDir('anv-0122-loader')
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('loads a skill WITHOUT an activation block (backward-compat)', async () => {
    mkdirSync(work, { recursive: true })
    const path = join(work, 'legacy.md')
    writeFileSync(
      path,
      `---
name: legacy
kind: atomic
group: development
description: legacy skill with no activation block
preferred_model: claude-sonnet-4-6
preferred_effort: medium
---

# body
`,
    )
    const skill = await loadSkillFile(path, 'universal')
    expect(skill).toBeDefined()
    expect(skill?.frontmatter.activation).toBeUndefined()
  })

  it('loads a skill WITH an activation block, preserving all sub-fields', async () => {
    mkdirSync(work, { recursive: true })
    const path = join(work, 'gated.md')
    writeFileSync(
      path,
      `---
name: gated
kind: atomic
group: development
description: gated skill with activation
preferred_model: claude-sonnet-4-6
preferred_effort: medium
activation:
  languages:
    - python
  globs:
    - "**/*.py"
  events:
    - pre-edit
---

# body
`,
    )
    const skill = await loadSkillFile(path, 'universal')
    expect(skill).toBeDefined()
    expect(skill?.frontmatter.activation?.languages).toEqual(['python'])
    expect(skill?.frontmatter.activation?.globs).toEqual(['**/*.py'])
    expect(skill?.frontmatter.activation?.events).toEqual(['pre-edit'])
  })

  it('rejects an activation block with unknown sub-fields (strict)', async () => {
    mkdirSync(work, { recursive: true })
    const path = join(work, 'invalid.md')
    writeFileSync(
      path,
      `---
name: invalid
kind: atomic
group: development
description: invalid activation block
preferred_model: claude-sonnet-4-6
preferred_effort: medium
activation:
  nonsense: ["bad"]
---

# body
`,
    )
    const skill = await loadSkillFile(path, 'universal', {
      warnOnInvalid: false,
    })
    expect(skill).toBeUndefined()
  })

  it('stamps scope=bundled by default when opts.scope is omitted', async () => {
    mkdirSync(work, { recursive: true })
    const path = join(work, 'no-scope.md')
    writeFileSync(
      path,
      `---
name: no-scope
kind: atomic
group: development
description: no scope passed
preferred_model: claude-sonnet-4-6
preferred_effort: medium
---

# body
`,
    )
    const skill = await loadSkillFile(path, 'universal')
    expect(skill?.scope).toBe('bundled')
  })

  it('honours an explicit opts.scope', async () => {
    mkdirSync(work, { recursive: true })
    const path = join(work, 'scoped.md')
    writeFileSync(
      path,
      `---
name: scoped
kind: atomic
group: development
description: scoped skill
preferred_model: claude-sonnet-4-6
preferred_effort: medium
---

# body
`,
    )
    const skill = await loadSkillFile(path, 'user', { scope: 'home' })
    expect(skill?.scope).toBe('home')
  })
})
