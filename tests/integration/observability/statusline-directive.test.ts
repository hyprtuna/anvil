import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildDirective,
  buildObservabilityPayload,
  mergeStatuslinePayload,
} from '../../../src/core/observability/index.js'
import { buildStatuslinePayload } from '../../../src/core/plans/runner/statusline-payload.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('merged statusline payload', () => {
  let tmp: string
  beforeEach(() => {
    tmp = createTestTmpDir('anvil-sl')
  })
  it('merges planRun + observability into a single passthrough shape', () => {
    const base = buildStatuslinePayload({
      runId: 'r1',
      planVersion: '0.14.0',
      status: 'in_progress',
      currentPhaseId: 'A',
      currentTaskId: 'A1',
    })
    const directive = buildDirective('context-risk-high', { usedPercent: 80 })
    const obs = buildObservabilityPayload({
      directives: [directive],
      activeProfile: 'standard',
      installedBundle: 'balanced',
      currentPhase: 'implement',
    })
    const merged = mergeStatuslinePayload(base, obs)
    expect(merged.planRun.runId).toBe('r1')
    expect(merged.planRun.currentPhaseId).toBe('A')
    expect(merged.observability?.activeProfile).toBe('standard')
    expect(merged.observability?.directives).toHaveLength(1)
  })

  it('round-trips through disk write/read', () => {
    const dir = join(tmp, '.anvil', 'runtime')
    mkdirSync(dir, { recursive: true })
    const base = buildStatuslinePayload({
      runId: 'r2',
      planVersion: '0.14.0',
      status: 'in_progress',
    })
    const directive = buildDirective('compaction-imminent', {
      preCompactBytes: 4096,
      capturedRuleCount: 2,
      snapshotPath: '/tmp/x',
    })
    const merged = mergeStatuslinePayload(
      base,
      buildObservabilityPayload({ directives: [directive] }),
    )
    const path = join(dir, 'statusline-payload.json')
    writeFileSync(path, JSON.stringify(merged))
    const reread = JSON.parse(readFileSync(path, 'utf-8')) as typeof merged
    expect(reread.observability?.directives).toHaveLength(1)
    expect(reread.observability?.directives[0]?.kind).toBe(
      'compaction-imminent',
    )
  })
})
