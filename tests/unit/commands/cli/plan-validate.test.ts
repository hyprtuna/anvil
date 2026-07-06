/**
 * Unit tests for `anvil plan-validate` (ANV-0026).
 *
 * Covers:
 *   - Exit 0 + green "OK" message on a valid plan.
 *   - Exit 1 + structured error on a plan with a bad depends_on edge.
 *   - --json mode emits a parseable JSON envelope on both success and failure.
 */

import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

const GOOD_PLAN = `---
executable_plan:
  version: v0.14.0
  theme: Good plan
  tasks:
    - id: A1
      title: First task
      type: feature
      effort: s
    - id: A2
      title: Second task
      type: fix
      effort: xs
      depends_on: [A1]
---

# v0.14.0
`

const BAD_DEP_PLAN = `---
executable_plan:
  version: v0.14.0
  theme: Bad plan
  tasks:
    - id: A1
      title: First task
      type: feature
      effort: s
      depends_on: [A99]
---

# Bad
`

describe('commands/cli/plan-validate', () => {
  let tmp: string
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>
  // Collected output so assertions can inspect what would have been written.
  let stdoutChunks: string[]
  let stderrChunks: string[]

  beforeEach(() => {
    tmp = createTestTmpDir('plan-validate')
    stdoutChunks = []
    stderrChunks = []
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
        return true
      })
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
        return true
      })
    // Prevent the failure path from actually exiting the test runner.
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    exitSpy.mockRestore()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('exits 0 with OK message on a valid plan', async () => {
    const planPath = join(tmp, 'plan.md')
    await writeFile(planPath, GOOD_PLAN, 'utf-8')

    const { planValidateCommand } = await import(
      '../../../../src/commands/cli/plan-validate.js'
    )
    await planValidateCommand(planPath)

    expect(exitSpy).not.toHaveBeenCalled()
    expect(stdoutChunks.join('')).toMatch(/OK /)
    expect(stdoutChunks.join('')).toMatch(/2 task\(s\)/)
  })

  it('emits a success JSON envelope with --json', async () => {
    const planPath = join(tmp, 'plan.md')
    await writeFile(planPath, GOOD_PLAN, 'utf-8')

    const { planValidateCommand } = await import(
      '../../../../src/commands/cli/plan-validate.js'
    )
    await planValidateCommand(planPath, { json: true })

    const out = stdoutChunks.join('')
    const payload = JSON.parse(out.trim()) as {
      ok: boolean
      tasks: number
      waves: number
    }
    expect(payload.ok).toBe(true)
    expect(payload.tasks).toBe(2)
    expect(payload.waves).toBe(0)
  })

  it('exits non-zero on a plan with a bad depends_on reference', async () => {
    const planPath = join(tmp, 'plan.md')
    await writeFile(planPath, BAD_DEP_PLAN, 'utf-8')

    const { planValidateCommand } = await import(
      '../../../../src/commands/cli/plan-validate.js'
    )
    await planValidateCommand(planPath)

    expect(exitSpy).toHaveBeenCalledWith(1)
    const err = stderrChunks.join('')
    expect(err).toMatch(/FAIL /)
    expect(err).toMatch(/reason: schema-invalid/)
    expect(err).toMatch(/depends on unknown task "A99"/)
  })

  it('emits a structured failure JSON envelope with --json', async () => {
    const planPath = join(tmp, 'plan.md')
    await writeFile(planPath, BAD_DEP_PLAN, 'utf-8')

    const { planValidateCommand } = await import(
      '../../../../src/commands/cli/plan-validate.js'
    )
    await planValidateCommand(planPath, { json: true })

    expect(exitSpy).toHaveBeenCalledWith(1)
    const payload = JSON.parse(stdoutChunks.join('').trim()) as {
      ok: boolean
      reason: string
      issues?: Array<{ path: string; message: string }>
    }
    expect(payload.ok).toBe(false)
    expect(payload.reason).toBe('schema-invalid')
    expect(payload.issues?.length ?? 0).toBeGreaterThan(0)
    expect(
      payload.issues?.some((i) => /unknown task "A99"/.test(i.message)),
    ).toBe(true)
  })

  it('throws when the plan file does not exist', async () => {
    const { planValidateCommand } = await import(
      '../../../../src/commands/cli/plan-validate.js'
    )
    await expect(
      planValidateCommand(join(tmp, 'nonexistent.md')),
    ).rejects.toThrow(/failed to read plan file/)
  })

  it('emits no-frontmatter for a plain markdown file with no YAML', async () => {
    const planPath = join(tmp, 'plain.md')
    await writeFile(planPath, '# No frontmatter here\n\nbody\n', 'utf-8')

    const { planValidateCommand } = await import(
      '../../../../src/commands/cli/plan-validate.js'
    )
    await planValidateCommand(planPath, { json: true })

    expect(exitSpy).toHaveBeenCalledWith(1)
    const payload = JSON.parse(stdoutChunks.join('').trim()) as {
      ok: boolean
      reason: string
    }
    expect(payload.ok).toBe(false)
    expect(payload.reason).toBe('no-frontmatter')
  })
})
