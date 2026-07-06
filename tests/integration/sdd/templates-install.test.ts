import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PlanFrontmatter } from '../../../src/core/types.js'
import { runInstaller } from '../../../src/installer/install.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

function makeTmp(): string {
  const tmp = createTestTmpDir('templates')
  return tmp
}

describe('integration/sdd/templates-install', () => {
  it('copies spec.md, plan.md, tasks.md to <cwd>/templates/ on project init', async () => {
    const tmp = makeTmp()
    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })

    expect(existsSync(join(tmp, 'templates', 'spec.md'))).toBe(true)
    expect(existsSync(join(tmp, 'templates', 'plan.md'))).toBe(true)
    expect(existsSync(join(tmp, 'templates', 'tasks.md'))).toBe(true)
  })

  it('spec.md contains mandatory section headings', async () => {
    const tmp = makeTmp()
    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })

    const specContent = await readFile(
      join(tmp, 'templates', 'spec.md'),
      'utf-8',
    )
    expect(specContent).toContain('## Goal')
    expect(specContent).toContain('## Scope')
    expect(specContent).toContain('## Open Questions')
    expect(specContent).toContain('<decisions>')
  })

  it('plan.md frontmatter parses against PlanFrontmatter Zod schema', async () => {
    const tmp = makeTmp()
    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })

    const planContent = await readFile(
      join(tmp, 'templates', 'plan.md'),
      'utf-8',
    )
    // Extract YAML frontmatter using gray-matter (already a project dep)
    const { default: matter } = await import('gray-matter')
    const { data: fm } = matter(planContent)
    // Must parse against the schema without throwing
    expect(() => PlanFrontmatter.parse(fm)).not.toThrow()
  })

  it('also copies templates for opencode target', async () => {
    const tmp = makeTmp()
    await runInstaller({
      target: 'opencode',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })

    expect(existsSync(join(tmp, 'templates', 'spec.md'))).toBe(true)
    expect(existsSync(join(tmp, 'templates', 'plan.md'))).toBe(true)
    expect(existsSync(join(tmp, 'templates', 'tasks.md'))).toBe(true)
  })

  it('.anvil/specs/features/ does NOT auto-exist after init', async () => {
    // ANV-0131: SDD features path moved from docs/anvil/features/ to .anvil/specs/features/
    const tmp = makeTmp()
    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    // Per spec: feature dirs created on first `anvil spec` (Phase F), not on init
    expect(existsSync(join(tmp, '.anvil', 'specs', 'features'))).toBe(false)
  })
})
