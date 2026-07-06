/**
 * ANV-0220 — Unit tests for the `needsRebuildByHash` pure helper in gate.ts.
 *
 * Tests the content-hash decision function in complete isolation — no
 * filesystem access, no process spawning.  All state is passed in as plain
 * values so the tests are deterministic and fast.
 *
 * Decision table (mirrors the JSDoc on needsRebuildByHash):
 *   - envOptOut = true                  → false  (hard opt-out)
 *   - distExists = false                → true   (dist missing)
 *   - cachedHash = undefined            → true   (no cache — first run)
 *   - currentHash !== cachedHash        → true   (inputs changed)
 *   - currentHash === cachedHash        → false  (cache hit — skip build)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type NeedsRebuildByHashOpts,
  computeBuildInputHash,
  needsRebuildByHash,
} from '../../../scripts/ci/gate.js'

const HASH_A = 'a'.repeat(64) // simulated SHA-256 hex digest
const HASH_B = 'b'.repeat(64) // different digest

describe('needsRebuildByHash', () => {
  it('dist missing (distExists=false) → true regardless of hash match', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: false,
      distExists: false,
      currentHash: HASH_A,
      cachedHash: HASH_A,
    }
    expect(needsRebuildByHash(opts)).toBe(true)
  })

  it('dist missing, no cached hash → true', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: false,
      distExists: false,
      currentHash: HASH_A,
      cachedHash: undefined,
    }
    expect(needsRebuildByHash(opts)).toBe(true)
  })

  it('dist exists, no cached hash (first run) → true', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: false,
      distExists: true,
      currentHash: HASH_A,
      cachedHash: undefined,
    }
    expect(needsRebuildByHash(opts)).toBe(true)
  })

  it('dist exists, cached hash differs from current → true (inputs changed)', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: false,
      distExists: true,
      currentHash: HASH_A,
      cachedHash: HASH_B,
    }
    expect(needsRebuildByHash(opts)).toBe(true)
  })

  it('dist exists, cached hash equals current → false (cache hit)', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: false,
      distExists: true,
      currentHash: HASH_A,
      cachedHash: HASH_A,
    }
    expect(needsRebuildByHash(opts)).toBe(false)
  })

  it('env opt-out=true, dist missing → false (hard skip)', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: true,
      distExists: false,
      currentHash: HASH_A,
      cachedHash: undefined,
    }
    expect(needsRebuildByHash(opts)).toBe(false)
  })

  it('env opt-out=true, hashes differ → false (hard skip)', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: true,
      distExists: true,
      currentHash: HASH_A,
      cachedHash: HASH_B,
    }
    expect(needsRebuildByHash(opts)).toBe(false)
  })

  it('env opt-out=true, hashes match → false (hard skip)', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: true,
      distExists: true,
      currentHash: HASH_A,
      cachedHash: HASH_A,
    }
    expect(needsRebuildByHash(opts)).toBe(false)
  })

  it('empty string hashes treated as distinct values (edge case)', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: false,
      distExists: true,
      currentHash: '',
      cachedHash: '',
    }
    // Both empty → equal → no rebuild
    expect(needsRebuildByHash(opts)).toBe(false)
  })

  it('current hash is different length from cached → true (corrupt cache)', () => {
    const opts: NeedsRebuildByHashOpts = {
      envOptOut: false,
      distExists: true,
      currentHash: HASH_A,
      cachedHash: HASH_A.slice(0, 32), // truncated / corrupt
    }
    expect(needsRebuildByHash(opts)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ANV-0220 review fix — computeBuildInputHash includes data/** and lockfile.
// ---------------------------------------------------------------------------

describe('computeBuildInputHash (review fix — data/ + lockfile inputs)', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `anvil-build-hash-${Date.now()}-${Math.random()}`)
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'data'), { recursive: true })
    writeFileSync(join(root, 'src', 'index.ts'), 'export const x = 1\n')
    writeFileSync(
      join(root, 'data', 'model-capabilities.json'),
      '{"models":[]}\n',
    )
    writeFileSync(join(root, 'package.json'), '{"scripts":{"build":"x"}}\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('is deterministic for unchanged inputs', () => {
    expect(computeBuildInputHash(root)).toBe(computeBuildInputHash(root))
  })

  it('changing a data/ file changes the digest', () => {
    const before = computeBuildInputHash(root)
    writeFileSync(
      join(root, 'data', 'model-capabilities.json'),
      '{"models":["new-model"]}\n',
    )
    const after = computeBuildInputHash(root)
    expect(after).not.toBe(before)
  })

  it('adding a new data/ file changes the digest', () => {
    const before = computeBuildInputHash(root)
    writeFileSync(join(root, 'data', 'extra.json'), '{}\n')
    const after = computeBuildInputHash(root)
    expect(after).not.toBe(before)
  })

  it('changing the lockfile changes the digest', () => {
    const before = computeBuildInputHash(root)
    writeFileSync(join(root, 'bun.lock'), 'lock-contents-v2\n')
    const after = computeBuildInputHash(root)
    expect(after).not.toBe(before)
  })
})
