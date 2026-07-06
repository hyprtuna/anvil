/**
 * E-005 — Required reading paths resolve doctor row (D-03, D-10).
 *
 * Verifies that pushRequiredReadingPathsResolveCheck:
 *   - pushes skip when not in project
 *   - pushes pass when all paths resolve
 *   - pushes warn with offender details when paths are missing
 *   - caps offender list at 3 with +N suffix
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  pushRequiredReadingBudgetCheck,
  pushRequiredReadingPathsResolveCheck,
} from '../../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const SKIP_DETAIL = 'not in project'

type Check = { name: string; status: string; detail: string }

let tmp: string

function writeAgent(dir: string, name: string, requiredReading?: string[]) {
  const agentsDir = join(dir, 'agents')
  mkdirSync(agentsDir, { recursive: true })
  const lines = [
    '---',
    `name: ${name}`,
    'model: sonnet',
    'tools: []',
    'max_turns: 5',
  ]
  if (requiredReading && requiredReading.length > 0) {
    lines.push('required_reading:')
    for (const p of requiredReading) {
      lines.push(`  - ${p}`)
    }
  }
  lines.push('---', '', `# ${name}`, '')
  writeFileSync(join(agentsDir, `${name}.md`), lines.join('\n'))
}

beforeEach(() => {
  tmp = createTestTmpDir('rr-doctor')
})

describe('pushRequiredReadingPathsResolveCheck', () => {
  it('pushes skip when not in project', () => {
    const checks: Check[] = []
    pushRequiredReadingPathsResolveCheck(checks, tmp, false, SKIP_DETAIL)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Required reading paths resolve')
    expect(checks[0].status).toBe('skip')
  })

  it('pushes pass when all paths resolve', () => {
    mkdirSync(join(tmp, 'agents'), { recursive: true })
    writeFileSync(join(tmp, 'exists.md'), '# exists')
    writeAgent(tmp, 'my-agent', ['exists.md'])
    const checks: Check[] = []
    pushRequiredReadingPathsResolveCheck(checks, tmp, true, SKIP_DETAIL)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Required reading paths resolve')
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('all required_reading paths resolve')
  })

  it('pushes warn when a path is missing', () => {
    writeAgent(tmp, 'broken-agent', ['missing-file.md'])
    const checks: Check[] = []
    pushRequiredReadingPathsResolveCheck(checks, tmp, true, SKIP_DETAIL)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Required reading paths resolve')
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('missing-file.md')
  })

  it('caps offender list at 3 with +N more suffix when >3 missing', () => {
    for (let i = 1; i <= 2; i++) {
      writeAgent(tmp, `agent-${i}`, [
        `missing-a-${i}.md`,
        `missing-b-${i}.md`,
        `missing-c-${i}.md`,
      ])
    }
    const checks: Check[] = []
    pushRequiredReadingPathsResolveCheck(checks, tmp, true, SKIP_DETAIL)
    expect(checks[0].status).toBe('warn')
    // 6 total missing paths: detail should cap at 3 and show +3 more
    expect(checks[0].detail).toMatch(/…\+\d+ more/)
  })

  it('pushes two rows when both budget and resolve checks run', () => {
    // Simulate runDoctor calling both checks in sequence
    writeAgent(tmp, 'clean-agent', [])
    const checks: Check[] = []
    pushRequiredReadingBudgetCheck(checks, tmp, true, SKIP_DETAIL)
    pushRequiredReadingPathsResolveCheck(checks, tmp, true, SKIP_DETAIL)
    const budgetRow = checks.find((c) => c.name === 'Required reading budget')
    const resolveRow = checks.find(
      (c) => c.name === 'Required reading paths resolve',
    )
    expect(budgetRow).toBeDefined()
    expect(resolveRow).toBeDefined()
  })
})
