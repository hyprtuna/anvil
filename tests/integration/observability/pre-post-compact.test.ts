import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildInstructionsLoadedResult } from '../../../src/hooks/handlers/observability/instructions-loaded.js'
import { buildPostCompactResult } from '../../../src/hooks/handlers/observability/post-compact.js'
import { buildPreCompactResult } from '../../../src/hooks/handlers/observability/pre-compact.js'
import {
  instructionsSnapshotPath,
  preCompactSnapshotPath,
  readSnapshot,
  writeSnapshot,
} from '../../../src/hooks/handlers/observability/snapshot-store.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('PreCompact → PostCompact round trip', () => {
  let cwd: string
  beforeEach(() => {
    cwd = createTestTmpDir('anvil-roundtrip')
  })
  it('detects degradation when rules vanished post-compact', () => {
    // 1. InstructionsLoaded baseline captured at session start.
    const baseline = buildInstructionsLoadedResult([
      { name: 'AGENTS.md', bytes: 4096 },
      { name: '.claude/rules/anvil-routing.md', bytes: 1024 },
      { name: '.claude/rules/extra.md', bytes: 512 },
    ])
    writeSnapshot(instructionsSnapshotPath(cwd), baseline.snapshot)

    // 2. PreCompact handler copies the baseline into pre-compact.json.
    const pre = buildPreCompactResult(cwd, baseline.snapshot)
    writeSnapshot(preCompactSnapshotPath(cwd), pre.snapshot)
    expect(pre.directive.kind).toBe('compaction-imminent')

    // 3. PostCompact (after compaction): rules vanished from the new session.
    const post = buildPostCompactResult(
      readSnapshot(preCompactSnapshotPath(cwd)),
      // Only AGENTS.md present in the post-compact world.
      buildInstructionsLoadedResult([{ name: 'AGENTS.md', bytes: 4096 }])
        .snapshot,
      preCompactSnapshotPath(cwd),
    )
    expect(post.directive).not.toBeNull()
    expect(post.directive?.kind).toBe('degradation-detected')
    expect(post.lostRules.sort()).toEqual(
      ['.claude/rules/anvil-routing.md', '.claude/rules/extra.md'].sort(),
    )
  })

  it('emits no degradation directive when post-compact rules are intact', () => {
    const baseline = buildInstructionsLoadedResult([
      { name: 'AGENTS.md', bytes: 4096 },
      { name: '.claude/rules/r1.md', bytes: 1024 },
    ])
    writeSnapshot(preCompactSnapshotPath(cwd), baseline.snapshot)
    const post = buildPostCompactResult(
      readSnapshot(preCompactSnapshotPath(cwd)),
      baseline.snapshot, // unchanged
    )
    expect(post.directive).toBeNull()
    expect(post.lostRules).toEqual([])
  })

  it('is a no-op when no pre-compact snapshot exists', () => {
    const current = buildInstructionsLoadedResult([
      { name: 'AGENTS.md', bytes: 4096 },
    ]).snapshot
    const post = buildPostCompactResult(null, current)
    expect(post.directive).toBeNull()
  })

  it('writes the snapshot to .anvil/notepads/observability/', () => {
    const baseline = buildInstructionsLoadedResult([
      { name: 'AGENTS.md', bytes: 100 },
    ]).snapshot
    // Ensure the writer creates the parent directory on demand.
    mkdirSync(join(cwd, '.anvil'), { recursive: true })
    expect(writeSnapshot(preCompactSnapshotPath(cwd), baseline)).toBe(true)
    expect(readSnapshot(preCompactSnapshotPath(cwd))).toEqual(baseline)
  })

  it('is silent (returns false) when target directory cannot be created (write failure)', () => {
    // Write to an obviously-invalid path (NUL byte) — exercised so we
    // know the writer swallows the failure without throwing.
    const ok = writeSnapshot('\0invalid\0path.json', {
      capturedAt: new Date().toISOString(),
      totalBytes: 0,
      sourceNames: [],
    })
    expect(ok).toBe(false)
  })
})
