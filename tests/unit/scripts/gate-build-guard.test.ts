/**
 * ANV-0162 — Unit tests for the `needsRebuild` pure helper in gate.ts.
 *
 * Tests the decision function in complete isolation — no filesystem access,
 * no process spawning. All I/O state is passed in as plain values.
 *
 * Four cases per the spec:
 *   1. dist missing        → rebuild required
 *   2. all src older       → no rebuild
 *   3. one src file newer  → rebuild required
 *   4. env opt-out         → no rebuild regardless of dist state
 */
import { describe, expect, it } from 'vitest'
import {
  type NeedsRebuildOpts,
  needsRebuild,
} from '../../../scripts/ci/gate.js'

const BASE_TIME = 1_000_000

describe('needsRebuild', () => {
  it('dist missing (distExists=false) → true', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: false,
      distExists: false,
      distMtime: undefined,
      srcMtimes: [BASE_TIME - 100, BASE_TIME - 200],
    }
    expect(needsRebuild(opts)).toBe(true)
  })

  it('dist exists with distMtime=undefined → true (defensive)', () => {
    // Should not happen in practice but the guard must handle it safely.
    const opts: NeedsRebuildOpts = {
      envOptOut: false,
      distExists: true,
      distMtime: undefined,
      srcMtimes: [BASE_TIME - 100],
    }
    expect(needsRebuild(opts)).toBe(true)
  })

  it('dist exists and all src files older than dist → false (no rebuild)', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: false,
      distExists: true,
      distMtime: BASE_TIME,
      srcMtimes: [BASE_TIME - 500, BASE_TIME - 300, BASE_TIME - 1],
    }
    expect(needsRebuild(opts)).toBe(false)
  })

  it('one src file has same mtime as dist → false (not strictly newer)', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: false,
      distExists: true,
      distMtime: BASE_TIME,
      srcMtimes: [BASE_TIME - 100, BASE_TIME],
    }
    expect(needsRebuild(opts)).toBe(false)
  })

  it('one src file is newer than dist → true', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: false,
      distExists: true,
      distMtime: BASE_TIME,
      srcMtimes: [BASE_TIME - 100, BASE_TIME + 1],
    }
    expect(needsRebuild(opts)).toBe(true)
  })

  it('all src files newer than dist → true', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: false,
      distExists: true,
      distMtime: BASE_TIME,
      srcMtimes: [BASE_TIME + 100, BASE_TIME + 200],
    }
    expect(needsRebuild(opts)).toBe(true)
  })

  it('env opt-out=true, dist missing → false (CI skips guard)', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: true,
      distExists: false,
      distMtime: undefined,
      srcMtimes: [BASE_TIME + 999],
    }
    expect(needsRebuild(opts)).toBe(false)
  })

  it('env opt-out=true, src newer than dist → false (CI skips guard)', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: true,
      distExists: true,
      distMtime: BASE_TIME,
      srcMtimes: [BASE_TIME + 1000],
    }
    expect(needsRebuild(opts)).toBe(false)
  })

  it('empty srcMtimes with dist present → false (no src files to compare)', () => {
    const opts: NeedsRebuildOpts = {
      envOptOut: false,
      distExists: true,
      distMtime: BASE_TIME,
      srcMtimes: [],
    }
    expect(needsRebuild(opts)).toBe(false)
  })
})
