/**
 * ANV-0025 Wave 4 — statusline payload tests.
 *
 * The payload schema is what ANV-0023 will consume. We pin the shape with
 * a snapshot-style test so a future schema change is visible.
 */

import { describe, expect, it } from 'vitest'
import type { PlanRunState } from '../../../../../src/core/plans/run-state.js'
import {
  PlanRunStatuslinePayload,
  buildStatuslinePayload,
} from '../../../../../src/core/plans/runner/statusline-payload.js'

const fullState: PlanRunState = {
  runId: 'r1',
  planVersion: 'v0.14.0',
  status: 'in_progress',
  currentPhaseId: 'wave-1',
  currentTaskId: 'A1',
  startedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:01:00.000Z',
  planSnapshot: {
    version: 'v0.14.0',
    theme: 't',
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
    composition: { debt: 0, improvements: 0, additions: 0, fixes: 0, docs: 0 },
  },
}

describe('buildStatuslinePayload', () => {
  it('renders the full shape when every field is set', () => {
    const payload = buildStatuslinePayload(fullState)
    expect(payload).toEqual({
      planRun: {
        runId: 'r1',
        planVersion: 'v0.14.0',
        status: 'in_progress',
        currentPhaseId: 'wave-1',
        currentTaskId: 'A1',
        updatedAt: '2026-01-01T00:01:00.000Z',
      },
    })
  })

  it('omits optional fields when absent', () => {
    const minimal: PlanRunState = {
      ...fullState,
      currentPhaseId: undefined,
      currentTaskId: undefined,
      updatedAt: undefined,
    }
    const payload = buildStatuslinePayload(minimal)
    expect(payload.planRun.currentPhaseId).toBeUndefined()
    expect(payload.planRun.currentTaskId).toBeUndefined()
    expect(payload.planRun.updatedAt).toBeUndefined()
  })

  it('validates against the Zod schema', () => {
    const payload = buildStatuslinePayload(fullState)
    expect(() => PlanRunStatuslinePayload.parse(payload)).not.toThrow()
  })
})
