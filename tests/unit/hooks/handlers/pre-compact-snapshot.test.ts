/**
 * Phase G — pre-compact snapshot handler tests
 *
 * Covers:
 * - PreCompact event with non-null feature_slug → snapshot file written
 * - Snapshot contains state.json + artifact heads + git log
 * - Snapshot file naming: pre-compact-<ISO-timestamp>.md
 * - Hook exits 0 even if state.json is missing or git log fails
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { preCompactSnapshotHandler } from '../../../../src/hooks/handlers/pre-compact.js'

// Each test uses an isolated tmpdir to avoid cross-test contamination.
let testDir: string

function makeCtx(payload: unknown, cwd?: string) {
  return {
    kind: 'pre-compact' as const,
    cwd: cwd ?? testDir,
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `anvil-test-precompact-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }
})

describe('hooks/handlers/pre-compact-snapshot', () => {
  it('writes a snapshot file when feature_slug is non-null', async () => {
    // Set up a valid .anvil/state.json
    const anvilDir = join(testDir, '.anvil')
    const notepadsDir = join(anvilDir, 'notepads')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(
      join(anvilDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        phase: 'spec',
        feature_slug: 'my-feature',
        completed_tasks: ['task-a'],
        pending_tasks: ['task-b'],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    )

    const r = await preCompactSnapshotHandler(makeCtx({ session_id: 'sess-1' }))

    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('pre-compact')
    expect(r.message).toContain('.anvil/notepads/pre-compact-')

    // Snapshot file should exist
    mkdirSync(notepadsDir, { recursive: true }) // ensure exists for assertion
    const files = existsSync(notepadsDir)
      ? (await import('node:fs')).readdirSync(notepadsDir)
      : []
    const snapshotFiles = files.filter(
      (f: string) => f.startsWith('pre-compact-') && f.endsWith('.md'),
    )
    expect(snapshotFiles).toHaveLength(1)
  })

  it('snapshot file contains state.json, git log section, and heading', async () => {
    const anvilDir = join(testDir, '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    const stateData = {
      schema_version: 1,
      phase: 'plan',
      feature_slug: 'auth-overhaul',
      completed_tasks: ['spec'],
      pending_tasks: ['implement', 'test'],
      updated_at: new Date().toISOString(),
    }
    writeFileSync(
      join(anvilDir, 'state.json'),
      JSON.stringify(stateData),
      'utf-8',
    )

    await preCompactSnapshotHandler(makeCtx(null))

    const notepadsDir = join(anvilDir, 'notepads')
    const files = existsSync(notepadsDir)
      ? (await import('node:fs')).readdirSync(notepadsDir)
      : []
    const snapshotFile = files.find(
      (f: string) => f.startsWith('pre-compact-') && f.endsWith('.md'),
    )
    expect(snapshotFile).toBeDefined()

    const content = readFileSync(
      join(notepadsDir, snapshotFile as string),
      'utf-8',
    )
    // Must contain the state JSON
    expect(content).toContain('auth-overhaul')
    expect(content).toContain('schema_version')
    // Must have a git log section (may be empty if git not available in test cwd)
    expect(content).toContain('## Recent Commits')
    // Must have a heading
    expect(content).toContain('# Pre-Compact Snapshot')
  })

  it('snapshot filename follows pre-compact-<ISO-timestamp>.md pattern', async () => {
    const anvilDir = join(testDir, '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(
      join(anvilDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        phase: 'none',
        completed_tasks: [],
        pending_tasks: [],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    )

    await preCompactSnapshotHandler(makeCtx(null))

    const notepadsDir = join(anvilDir, 'notepads')
    const files = existsSync(notepadsDir)
      ? (await import('node:fs')).readdirSync(notepadsDir)
      : []
    const snapshotFile = files.find(
      (f: string) => f.startsWith('pre-compact-') && f.endsWith('.md'),
    )
    expect(snapshotFile).toBeDefined()
    // Should match: pre-compact-<ISO>.md where ISO is like 2026-04-27T...
    expect(snapshotFile).toMatch(
      /^pre-compact-\d{4}-\d{2}-\d{2}T[\d:.Z+-]+\.md$/,
    )
  })

  it('exits 0 even when state.json is missing', async () => {
    // No .anvil/state.json — should not throw or return error exit code
    const r = await preCompactSnapshotHandler(makeCtx(null))
    expect(r.exitCode).toBe(0)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('exits 0 even when git log fails (e.g. not a git repo)', async () => {
    // Create a dir that is definitely not a git repo
    const nonGitDir = join(tmpdir(), `anvil-test-nongit-${Date.now()}`)
    mkdirSync(nonGitDir, { recursive: true })
    const anvilDir = join(nonGitDir, '.anvil')
    mkdirSync(anvilDir, { recursive: true })
    writeFileSync(
      join(anvilDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        phase: 'none',
        completed_tasks: [],
        pending_tasks: [],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    )

    const ctx = {
      kind: 'pre-compact' as const,
      cwd: nonGitDir,
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await preCompactSnapshotHandler(ctx)
    expect(r.exitCode).toBe(0)
    expect(() => HookResult.parse(r)).not.toThrow()

    rmSync(nonGitDir, { recursive: true, force: true })
  })

  it('returns valid HookResult shape', async () => {
    const r = await preCompactSnapshotHandler(makeCtx(null))
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
