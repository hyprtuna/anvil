import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// ─── Fixture plan: two decisions, only D-001 is referenced in the body ────────

const FIXTURE_PLAN_PARTIAL = `---
plan: 30
version: v0.6.0
---

# Plan 30 — Workflow Gates

<decisions>
- id: D-001
  title: Use Zod for boundary validation
  rationale: Consistent with existing types.ts conventions; catches bad input early.

- id: D-002
  title: Parser lives in core/validation
  rationale: Pure function, no I/O — fits Layer 0.
</decisions>

## Phase D — Decision coverage gates

D1. Schema in types.ts — see D-001 for rationale.

D2. Coverage check. anvil plan check-decisions ensures decisions are referenced.
`

// Both decisions referenced
const FIXTURE_PLAN_FULL = `---
plan: 30
---

<decisions>
- id: D-001
  title: Schema decision
  rationale: Zod is the standard.

- id: D-002
  title: Parser decision
  rationale: Layer 0 placement.
</decisions>

## Phase D

D1 references D-001 for schema decisions.
D2 references D-002 for parser placement.
`

// No decisions block
const FIXTURE_PLAN_NO_BLOCK = `---
plan: 99
---

# Plan without decisions

A1. Some task.
A2. Another task.
`

describe('commands/cli/plan-check-decisions', () => {
  let tmp: string
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmp = createTestTmpDir('pcd')
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('identifies covered and uncovered decision ids correctly', async () => {
    const planPath = join(tmp, 'plan-partial.md')
    await writeFile(planPath, FIXTURE_PLAN_PARTIAL, 'utf-8')

    const { planCheckDecisionsCommand } = await import(
      '../../../src/commands/cli/plan-check-decisions.js'
    )
    await planCheckDecisionsCommand(planPath, {})

    // D-001 is mentioned in the body; D-002 is not
    const stdoutCalls = stdoutSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(stdoutCalls).toContain('D-001')

    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(stderrCalls).toContain('D-002')
  })

  it('reports all covered when every decision id appears in the body', async () => {
    const planPath = join(tmp, 'plan-full.md')
    await writeFile(planPath, FIXTURE_PLAN_FULL, 'utf-8')

    const { planCheckDecisionsCommand } = await import(
      '../../../src/commands/cli/plan-check-decisions.js'
    )
    await planCheckDecisionsCommand(planPath, {})

    const stdoutCalls = stdoutSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(stdoutCalls).toContain('All decisions are referenced')
  })

  it('does not exit 1 in soft mode with uncovered decisions', async () => {
    const planPath = join(tmp, 'plan-partial2.md')
    await writeFile(planPath, FIXTURE_PLAN_PARTIAL, 'utf-8')

    const { planCheckDecisionsCommand } = await import(
      '../../../src/commands/cli/plan-check-decisions.js'
    )
    // Should resolve without throwing
    await expect(
      planCheckDecisionsCommand(planPath, {}),
    ).resolves.toBeUndefined()
  })

  it('exits with code 1 in --strict mode when decisions are uncovered', async () => {
    const planPath = join(tmp, 'plan-strict.md')
    await writeFile(planPath, FIXTURE_PLAN_PARTIAL, 'utf-8')

    const { planCheckDecisionsCommand } = await import(
      '../../../src/commands/cli/plan-check-decisions.js'
    )

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => {
      throw new Error(`process.exit(${String(_code)})`)
    })

    try {
      await expect(
        planCheckDecisionsCommand(planPath, { strict: true }),
      ).rejects.toThrow('process.exit(1)')
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('does not exit 1 in --strict mode when all decisions are covered', async () => {
    const planPath = join(tmp, 'plan-strict-pass.md')
    await writeFile(planPath, FIXTURE_PLAN_FULL, 'utf-8')

    const { planCheckDecisionsCommand } = await import(
      '../../../src/commands/cli/plan-check-decisions.js'
    )
    await expect(
      planCheckDecisionsCommand(planPath, { strict: true }),
    ).resolves.toBeUndefined()
  })

  it('warns and exits 0 when no <decisions> block is found', async () => {
    const planPath = join(tmp, 'plan-no-block.md')
    await writeFile(planPath, FIXTURE_PLAN_NO_BLOCK, 'utf-8')

    const { planCheckDecisionsCommand } = await import(
      '../../../src/commands/cli/plan-check-decisions.js'
    )
    await expect(
      planCheckDecisionsCommand(planPath, {}),
    ).resolves.toBeUndefined()

    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(stderrCalls).toContain('No <decisions> block found')
  })

  it('throws when the plan file does not exist', async () => {
    const { planCheckDecisionsCommand } = await import(
      '../../../src/commands/cli/plan-check-decisions.js'
    )
    await expect(
      planCheckDecisionsCommand(join(tmp, 'nonexistent.md'), {}),
    ).rejects.toThrow('plan file not found')
  })
})
