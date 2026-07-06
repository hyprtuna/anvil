/**
 * ANV-0025 Wave 4 — CC Task() lifecycle observer tests.
 *
 * The handler is best-effort: when no plan run is active OR the env
 * gate is off, it must be a silent no-op.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootstrapRun } from '../../../src/core/plans/bootstrap.js'
import type { ExecutablePlan } from '../../../src/core/plans/schema.js'
import type { HookContext } from '../../../src/core/types.js'
import {
  ccTaskCompletedHandler,
  ccTaskCreatedHandler,
} from '../../../src/hooks/handlers/cc-task-events.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const plan: ExecutablePlan = {
  version: 'v0.14.0',
  theme: 'cc-task-events fixture',
  waves: [],
  tasks: [
    {
      id: 'A1',
      title: 't',
      type: 'feature',
      effort: 's',
      depends_on: [],
      write_scope: [],
      verification: [],
    },
  ],
  exit_criteria: [],
}

function baseCtx(env: Record<string, string>): HookContext {
  return {
    kind: 'pre-tool-use',
    cwd: '/tmp',
    // The schema requires a config; we pass a minimal one. The handler
    // does not consult it, so the shape just has to validate.
    config: {
      version: 1,
      defaults: { model: 'sonnet', effort: 'medium' },
      overrides: {},
      groups: {},
      skills: {},
    } as unknown as HookContext['config'],
    env,
    payload: null,
  }
}

describe('ccTaskCreatedHandler — gating', () => {
  it('no-ops when ANVIL_PLAN_RUN_DIR is unset', async () => {
    const ctx = baseCtx({})
    const result = await ccTaskCreatedHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.message).toBeUndefined()
  })

  it('no-ops when ANVIL_CC_TASK_EVENTS=off', async () => {
    const tmp = createTestTmpDir('cc-task-off')
    await bootstrapRun({ runId: 'r1', runDir: tmp, plan })
    const ctx = baseCtx({
      ANVIL_PLAN_RUN_DIR: tmp,
      ANVIL_CC_TASK_EVENTS: 'off',
    })
    const result = await ccTaskCreatedHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.message).toBeUndefined()
  })

  it('no-ops when the payload is not a Task invocation', async () => {
    const tmp = createTestTmpDir('cc-task-not-task')
    await bootstrapRun({ runId: 'r1', runDir: tmp, plan })
    const ctx: HookContext = {
      ...baseCtx({ ANVIL_PLAN_RUN_DIR: tmp }),
      payload: { tool_name: 'Read', tool_input: { file: 'a.txt' } },
    }
    const result = await ccTaskCreatedHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.message).toBeUndefined()
  })

  it('emits a banner when a Task is dispatched during an active run', async () => {
    const tmp = createTestTmpDir('cc-task-active')
    await bootstrapRun({ runId: 'r1', runDir: tmp, plan })
    const ctx: HookContext = {
      ...baseCtx({ ANVIL_PLAN_RUN_DIR: tmp }),
      payload: {
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'anvil:code-architect',
          description: 'plan something',
        },
      },
    }
    const result = await ccTaskCreatedHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.message).toContain('plan-run:r1')
    expect(result.message).toContain('anvil:code-architect')
    expect(result.context?.planRunId).toBe('r1')
  })

  it('survives an unreadable state.yml without throwing', async () => {
    const tmp = createTestTmpDir('cc-task-corrupt-state')
    // Write a garbage state.yml; plan run dir exists but state isn't JSON.
    writeFileSync(join(tmp, 'state.yml'), 'this is not json\n')
    const ctx: HookContext = {
      ...baseCtx({ ANVIL_PLAN_RUN_DIR: tmp }),
      payload: {
        tool_name: 'Task',
        tool_input: { subagent_type: 'anvil:debug' },
      },
    }
    const result = await ccTaskCreatedHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.message).toContain('(no-run-id)')
  })
})

describe('ccTaskCompletedHandler — gating', () => {
  it('no-ops when no plan is active', async () => {
    const ctx = baseCtx({})
    const result = await ccTaskCompletedHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.message).toBeUndefined()
  })

  it('emits a banner when a plan is active', async () => {
    const tmp = createTestTmpDir('cc-stop')
    await bootstrapRun({ runId: 'r2', runDir: tmp, plan })
    const ctx = baseCtx({ ANVIL_PLAN_RUN_DIR: tmp })
    const result = await ccTaskCompletedHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.message).toContain('plan-run:r2')
    expect(result.context?.planRunId).toBe('r2')
  })
})
