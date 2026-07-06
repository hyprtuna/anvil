import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  type RuleSnapshot,
  diffLostRules,
  instructionsSnapshotPath,
  preCompactSnapshotPath,
  readSnapshot,
  writeSnapshot,
} from '../../../../../src/hooks/handlers/observability/snapshot-store.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

describe('snapshot-store paths', () => {
  it('places snapshots under .anvil/notepads/observability/', () => {
    const cwd = '/work/repo'
    expect(instructionsSnapshotPath(cwd)).toBe(
      join(cwd, '.anvil/notepads/observability/instructions-loaded.json'),
    )
    expect(preCompactSnapshotPath(cwd)).toBe(
      join(cwd, '.anvil/notepads/observability/pre-compact.json'),
    )
  })
})

describe('writeSnapshot/readSnapshot', () => {
  let tmp: string
  beforeEach(() => {
    tmp = createTestTmpDir('anvil-obs')
  })
  it('round-trips a snapshot through disk', () => {
    const snap: RuleSnapshot = {
      capturedAt: '2026-05-15T00:00:00.000Z',
      totalBytes: 4096,
      sourceNames: ['AGENTS.md'],
    }
    const p = instructionsSnapshotPath(tmp)
    expect(writeSnapshot(p, snap)).toBe(true)
    expect(readSnapshot(p)).toEqual(snap)
  })

  it('returns null when the snapshot is missing', () => {
    expect(readSnapshot(join(tmp, 'no-such-file.json'))).toBeNull()
  })
})

describe('diffLostRules', () => {
  const ts = '2026-05-15T00:00:00.000Z'
  const mk = (names: string[]): RuleSnapshot => ({
    capturedAt: ts,
    totalBytes: 0,
    sourceNames: names,
  })

  it('returns names in baseline absent from current', () => {
    expect(diffLostRules(mk(['A', 'B', 'C']), mk(['A']))).toEqual(['B', 'C'])
  })

  it('returns empty array when nothing was lost', () => {
    expect(diffLostRules(mk(['A']), mk(['A', 'B']))).toEqual([])
  })
})
