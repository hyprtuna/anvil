/**
 * ANV-0025 Wave 4 — step registry unit tests.
 *
 * The registry maps every PlanTaskType to a StepBase subclass. Most types
 * share a DefaultExecutorStep (delegates to a Task() dispatcher); the
 * registry is consulted at runtime by the runner state machine.
 */

import { describe, expect, it } from 'vitest'
import {
  DefaultExecutorStep,
  STEP_REGISTRY,
  type StepBase,
  type StepContext,
} from '../../../../../src/core/plans/runner/step-registry.js'
import { PlanTaskType } from '../../../../../src/core/plans/schema.js'

describe('STEP_REGISTRY', () => {
  it('exposes a step entry for every PlanTaskType', () => {
    const expected = new Set(PlanTaskType.options)
    const actual = new Set(STEP_REGISTRY.keys())
    expect(actual).toEqual(expected)
  })

  it('every registered entry declares its type_key matching its key', () => {
    for (const [typeKey, step] of STEP_REGISTRY.entries()) {
      expect(step.type_key).toBe(typeKey)
    }
  })

  it('DefaultExecutorStep returns a success result when no dispatcher is wired', async () => {
    const step: StepBase = new DefaultExecutorStep('feature')
    const ctx: StepContext = {
      task: {
        id: 'A1',
        title: 't',
        type: 'feature',
        effort: 's',
        depends_on: [],
        write_scope: [],
        verification: [],
      },
      auto: false,
    }
    const result = await step.execute(ctx)
    expect(result.outcome).toBe('success')
    expect(result.dispatched).toBe(false)
  })

  it('DefaultExecutorStep returns "dispatched" when --auto and dispatcher provided', async () => {
    const step: StepBase = new DefaultExecutorStep('feature')
    let dispatchedTaskId: string | null = null
    const ctx: StepContext = {
      task: {
        id: 'B1',
        title: 't',
        type: 'feature',
        effort: 's',
        depends_on: [],
        write_scope: [],
        verification: [],
      },
      auto: true,
      dispatch: async (input) => {
        dispatchedTaskId = input.task.id
        return { outcome: 'success' }
      },
    }
    const result = await step.execute(ctx)
    expect(result.outcome).toBe('success')
    expect(result.dispatched).toBe(true)
    expect(dispatchedTaskId).toBe('B1')
  })

  it('propagates a failed dispatch outcome', async () => {
    const step: StepBase = new DefaultExecutorStep('fix')
    const ctx: StepContext = {
      task: {
        id: 'C1',
        title: 't',
        type: 'fix',
        effort: 's',
        depends_on: [],
        write_scope: [],
        verification: [],
      },
      auto: true,
      dispatch: async () => ({
        outcome: 'failed',
        error: { message: 'simulated dispatch failure' },
      }),
    }
    const result = await step.execute(ctx)
    expect(result.outcome).toBe('failed')
    expect(result.error?.message).toBe('simulated dispatch failure')
  })
})
