/**
 * ANV-0153 — Unit tests for checkPrePushParity (pre-push hook parity check).
 *
 * Tests the pure helper against synthetic package.json fixtures in a temp dir,
 * plus a snapshot assertion that the real repo's package.json has the canonical
 * `bun run gate` pre-push hook (replaces the narrower test ANV-0152 would have
 * shipped).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CANONICAL_PRE_PUSH,
  checkPrePushParity,
} from '../../../src/commands/cli/doctor.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `anv-0153-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function writePackageJson(content: unknown): void {
  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify(content), 'utf-8')
}

// ---------------------------------------------------------------------------
// CANONICAL_PRE_PUSH constant
// ---------------------------------------------------------------------------

describe('CANONICAL_PRE_PUSH', () => {
  it('is the expected gate command', () => {
    expect(CANONICAL_PRE_PUSH).toBe('bun run gate')
  })
})

// ---------------------------------------------------------------------------
// checkPrePushParity — synthetic fixtures
// ---------------------------------------------------------------------------

describe('checkPrePushParity', () => {
  it('canonical hook value → pass', () => {
    writePackageJson({
      name: 'test',
      'simple-git-hooks': {
        'pre-push': 'bun run gate',
      },
    })
    const result = checkPrePushParity(tmpDir)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('bun run gate')
  })

  it('legacy chain → warn (detail mentions both actual and expected)', () => {
    const legacyChain =
      'bunx tsx scripts/ci/check-rebase-base.ts && bun run test && bun run tsc --noEmit'
    writePackageJson({
      name: 'test',
      'simple-git-hooks': {
        'pre-push': legacyChain,
      },
    })
    const result = checkPrePushParity(tmpDir)
    expect(result.status).toBe('warn')
    // Detail must mention the actual value
    expect(result.detail).toContain(legacyChain)
    // Detail must mention the expected value
    expect(result.detail).toContain(CANONICAL_PRE_PUSH)
  })

  it('empty simple-git-hooks block → skip', () => {
    writePackageJson({
      name: 'test',
      'simple-git-hooks': {},
    })
    const result = checkPrePushParity(tmpDir)
    expect(result.status).toBe('skip')
  })

  it('missing simple-git-hooks entirely → skip', () => {
    writePackageJson({ name: 'test', version: '1.0.0' })
    const result = checkPrePushParity(tmpDir)
    expect(result.status).toBe('skip')
  })

  it('missing package.json → skip', () => {
    // tmpDir exists but has no package.json
    const result = checkPrePushParity(tmpDir)
    expect(result.status).toBe('skip')
  })

  it('invalid JSON package.json → skip', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{ broken json ]', 'utf-8')
    const result = checkPrePushParity(tmpDir)
    expect(result.status).toBe('skip')
  })
})

// ---------------------------------------------------------------------------
// Snapshot: real repo package.json has `bun run gate`
// ---------------------------------------------------------------------------

describe('real repo package.json snapshot', () => {
  it('simple-git-hooks.pre-push === "bun run gate"', () => {
    // Resolve repo root: this test file is at tests/unit/release/ so root is 3 levels up
    const repoRoot = join(
      fileURLToPath(import.meta.url),
      '..',
      '..',
      '..',
      '..',
    )
    const result = checkPrePushParity(repoRoot)
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('bun run gate')
  })
})
