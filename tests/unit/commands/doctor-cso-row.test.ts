import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { skillLintCommand } from '../../../src/commands/cli/skill-lint.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * ANV-0184 — CSO discipline check migrated from `anvil doctor` to
 * `anvil skill lint`. These tests verify the check fires correctly
 * from the skill lint surface.
 *
 * Non-blocking lint: pass / warn / skip only (never fail).
 */

function makeSkillsDir(): { dir: string; skillsDir: string } {
  const dir = createTestTmpDir('cso-skill-lint')
  mkdirSync(join(dir, 'skills', 'universal'), { recursive: true })
  return { dir, skillsDir: join(dir, 'skills') }
}

function writeSkill(
  skillsDir: string,
  filename: string,
  description: string,
): void {
  const body = `---
name: ${filename.replace(/\.md$/, '')}
description: ${description}
preferred_model: haiku
preferred_effort: low
group: rules
kind: meta
tools: []
---

# ${filename}

(test fixture)
`
  writeFileSync(join(skillsDir, 'universal', filename), body)
}

async function runSkillLint(
  skillsDir: string,
): Promise<Array<{ name: string; status: string; detail: string }>> {
  const captured: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    captured.push(String(chunk))
    return true
  })
  try {
    await skillLintCommand({
      cwd: skillsDir,
      anvilHome: join(skillsDir, '.anvil'),
      target: skillsDir,
      json: true,
    })
  } finally {
    spy.mockRestore()
  }
  const raw = captured.join('')
  const parsed = JSON.parse(raw) as {
    results: Array<{ name: string; status: string; detail: string }>
  }
  return parsed.results
}

describe('anvil skill lint — CSO discipline check (, Plan 39 Phase B)', () => {
  let origCwd: string

  beforeEach(() => {
    origCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(origCwd)
  })

  it('reports `pass` when every skill description follows CSO discipline', async () => {
    const { skillsDir } = makeSkillsDir()
    writeSkill(
      skillsDir,
      'good-1.md',
      'Use when reviewing a diff — emits findings.',
    )
    writeSkill(
      skillsDir,
      'good-2.md',
      'Use when implementing an end-to-end feature — plan, code, test.',
    )
    const results = await runSkillLint(skillsDir)
    const cso = results.find((r) => r.name === 'CSO discipline')
    expect(cso, 'skill lint must emit a CSO discipline row').toBeDefined()
    expect(cso!.status).toBe('pass')
    expect(cso!.detail).toMatch(/\d+ skill description/)
  })

  it('reports `warn` (NEVER fail) when a skill description fails CSO discipline', async () => {
    const { skillsDir } = makeSkillsDir()
    writeSkill(
      skillsDir,
      'good.md',
      'Use when reviewing a diff — emits findings.',
    )
    writeSkill(
      skillsDir,
      'bad-noun.md',
      'Django development — CBVs, ORM, migrations.',
    )
    writeSkill(skillsDir, 'bad-verb.md', 'Reviews diffs and produces findings.')
    const results = await runSkillLint(skillsDir)
    const cso = results.find((r) => r.name === 'CSO discipline')
    expect(cso, 'skill lint must emit a CSO discipline row').toBeDefined()
    expect(cso!.status).toBe('warn')
    expect(cso!.status).not.toBe('fail')
    expect(cso!.detail).toMatch(/2 skill description/)
  })
})
