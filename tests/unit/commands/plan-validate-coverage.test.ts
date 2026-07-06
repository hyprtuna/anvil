import { existsSync, readFileSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// Fixture plan markdown with Anvil-style phase headings
const FIXTURE_PLAN = `---
plan: 30
version: v0.6.0
---

# Plan 30 — Workflow Gates

## Phase C — Nyquist validation layer

C1. **Concept.** Map each task to a test command.

C2. **Schema.** ValidationMap Zod type: task_id, test_command.

C3. **Detection.** detect.ts reads project test config. (M)

C4. **CLI.** \`anvil plan validate-coverage <plan-file>\`. (S)
`

describe('commands/cli/plan-validate-coverage', () => {
  let tmp: string
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmp = createTestTmpDir('pvc')
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('writes a sibling -validation.json with the correct shape', async () => {
    const planPath = join(tmp, '2026-04-24-30-workflow-gates.md')
    await writeFile(planPath, FIXTURE_PLAN, 'utf-8')

    const { planValidateCoverageCommand } = await import(
      '../../../src/commands/cli/plan-validate-coverage.js'
    )
    await planValidateCoverageCommand(planPath)

    const jsonPath = join(tmp, '2026-04-24-30-workflow-gates-validation.json')
    expect(existsSync(jsonPath)).toBe(true)

    const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<
      string,
      unknown
    >
    expect(raw).toHaveProperty('plan_path')
    expect(raw).toHaveProperty('generated_at')
    expect(raw).toHaveProperty('detected_runners')
    expect(raw).toHaveProperty('entries')
    expect(raw).toHaveProperty('uncovered_tasks')
  })

  it('writes a sibling -validation.md', async () => {
    const planPath = join(tmp, '2026-04-24-30-workflow-gates.md')
    await writeFile(planPath, FIXTURE_PLAN, 'utf-8')

    const { planValidateCoverageCommand } = await import(
      '../../../src/commands/cli/plan-validate-coverage.js'
    )
    await planValidateCoverageCommand(planPath)

    const mdPath = join(tmp, '2026-04-24-30-workflow-gates-validation.md')
    expect(existsSync(mdPath)).toBe(true)
    const content = readFileSync(mdPath, 'utf-8')
    expect(content).toMatch(/Validation Coverage Map/)
  })

  it('lists uncovered_tasks when no runner is detected', async () => {
    // Tmp dir has no package.json / go.mod / Cargo.toml → no runner detected
    const planPath = join(tmp, 'plan.md')
    await writeFile(planPath, FIXTURE_PLAN, 'utf-8')

    const { planValidateCoverageCommand } = await import(
      '../../../src/commands/cli/plan-validate-coverage.js'
    )

    // Change cwd to the empty tmp dir so detectProject finds no runners
    const origCwd = process.cwd()
    process.chdir(tmp)
    try {
      await planValidateCoverageCommand(planPath)
    } finally {
      process.chdir(origCwd)
    }

    const jsonPath = join(tmp, 'plan-validation.json')
    const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as {
      uncovered_tasks: string[]
      entries: unknown[]
    }

    // With no runner detected, all 4 tasks should be uncovered
    expect(raw.uncovered_tasks.length).toBeGreaterThan(0)
    expect(raw.entries).toHaveLength(0)
  })

  it('throws when the plan file does not exist', async () => {
    const { planValidateCoverageCommand } = await import(
      '../../../src/commands/cli/plan-validate-coverage.js'
    )
    await expect(
      planValidateCoverageCommand(join(tmp, 'nonexistent.md')),
    ).rejects.toThrow('plan file not found')
  })
})
