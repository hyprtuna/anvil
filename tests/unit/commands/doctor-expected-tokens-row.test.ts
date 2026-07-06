import { rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushExpectedTokensCoverageCheck } from '../../../src/commands/cli/doctor-checks/content.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * ANV-0114 — doctor row covering the percentage of skills/agents that have
 * not yet adopted the `expected_tokens` field. Warn-not-fail so partial
 * adoption never blocks installs.
 */

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

let ROOT: string

beforeEach(() => {
  ROOT = createTestTmpDir('anv-0114-doctor')
})

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

async function writeSkill(
  root: string,
  name: string,
  extra: string,
): Promise<void> {
  const dir = join(root, 'skills', 'universal', name)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    `---
name: ${name}
kind: atomic
group: development
description: test skill
preferred_model: balanced
preferred_effort: medium
${extra}---

body
`,
    'utf-8',
  )
}

describe('pushExpectedTokensCoverageCheck', () => {
  it('warns when one or more skills lack expected_tokens', async () => {
    await writeSkill(ROOT, 'has-it', 'expected_tokens: 1000\n')
    await writeSkill(ROOT, 'no-it', '')
    const checks: Check[] = []
    await pushExpectedTokensCoverageCheck(checks, ROOT, true, 'skip')
    const row = checks.find((c) => c.name === 'expected_tokens coverage')
    expect(row).toBeDefined()
    expect(row?.status).toBe('warn')
    expect(row?.detail).toContain('missing expected_tokens')
  })

  it('passes when every skill declares expected_tokens', async () => {
    await writeSkill(ROOT, 'one', 'expected_tokens: 1000\n')
    await writeSkill(ROOT, 'two', 'expected_tokens: 2000\n')
    const checks: Check[] = []
    await pushExpectedTokensCoverageCheck(checks, ROOT, true, 'skip')
    const row = checks.find((c) => c.name === 'expected_tokens coverage')
    expect(row).toBeDefined()
    expect(row?.status).toBe('pass')
    expect(row?.detail).toContain('declares expected_tokens')
  })

  it('skips when not in a project root', async () => {
    const checks: Check[] = []
    await pushExpectedTokensCoverageCheck(
      checks,
      ROOT,
      false,
      'not in a project root',
    )
    const row = checks.find((c) => c.name === 'expected_tokens coverage')
    expect(row?.status).toBe('skip')
    expect(row?.detail).toContain('not in a project root')
  })

  it('skips cleanly when skills/agents directories are missing', async () => {
    const checks: Check[] = []
    await pushExpectedTokensCoverageCheck(checks, ROOT, true, 'no dirs')
    const row = checks.find((c) => c.name === 'expected_tokens coverage')
    expect(row?.status).toBe('skip')
  })

  it('never reports a fail status (warn-not-fail policy)', async () => {
    // Even 100% missing should produce warn, never fail.
    await writeSkill(ROOT, 's1', '')
    await writeSkill(ROOT, 's2', '')
    await writeSkill(ROOT, 's3', '')
    const checks: Check[] = []
    await pushExpectedTokensCoverageCheck(checks, ROOT, true, 'skip')
    const row = checks.find((c) => c.name === 'expected_tokens coverage')
    expect(row?.status).toBe('warn')
    expect(row?.status).not.toBe('fail')
  })
})
