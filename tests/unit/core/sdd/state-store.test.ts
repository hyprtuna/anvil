import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetLegacyWarningForTest,
  readState,
  updateState,
  writeState,
} from '../../../../src/core/sdd/state-store.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// Capture stderr output
let stderrOutput = ''

function captureStderr(): void {
  stderrOutput = ''
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrOutput += String(chunk)
    return true
  })
}

function restoreStderr(): void {
  vi.restoreAllMocks()
  stderrOutput = ''
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = createTestTmpDir('state-test')
  // Reset the once-per-process flag so each test starts clean.
  _resetLegacyWarningForTest()
})

afterEach(async () => {
  restoreStderr()
  await rm(tmpDir, { recursive: true, force: true })
})

describe('readState', () => {
  it('returns default state when .anvil/state.json is absent', async () => {
    const state = await readState(tmpDir)
    expect(state.schema_version).toBe(1)
    expect(state.phase).toBe('none')
    expect(state.completed_tasks).toEqual([])
    expect(state.pending_tasks).toEqual([])
    expect(typeof state.updated_at).toBe('string')
  })

  it('round-trips: write → read → equals written state', async () => {
    const initial = await readState(tmpDir)
    const mutated = { ...initial, phase: 'spec' as const, feature_slug: 'demo' }
    await writeState(tmpDir, mutated)

    const loaded = await readState(tmpDir)
    expect(loaded.phase).toBe('spec')
    expect(loaded.feature_slug).toBe('demo')
    expect(loaded.schema_version).toBe(1)
  })

  it('throws on schema_version mismatch', async () => {
    const { mkdir } = await import('node:fs/promises')
    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })
    await writeFile(
      join(anvilDir, 'state.json'),
      JSON.stringify({
        schema_version: 2,
        phase: 'none',
        completed_tasks: [],
        pending_tasks: [],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    )

    await expect(readState(tmpDir)).rejects.toThrow(/schema_version/)
  })

  it('logs a one-time warning and returns default when legacy progress.json is present', async () => {
    const { mkdir } = await import('node:fs/promises')
    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })
    // Write legacy file but NOT state.json
    await writeFile(
      join(anvilDir, 'progress.json'),
      JSON.stringify({ tasks: [] }),
      'utf-8',
    )

    captureStderr()
    const state = await readState(tmpDir)

    expect(stderrOutput).toMatch(/legacy.*progress\.json/i)
    // Returns default, does NOT merge legacy data
    expect(state.schema_version).toBe(1)
    expect(state.phase).toBe('none')
  })

  it('only warns once per process about legacy progress.json', async () => {
    const { mkdir } = await import('node:fs/promises')
    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })
    await writeFile(
      join(anvilDir, 'progress.json'),
      JSON.stringify({ tasks: [] }),
      'utf-8',
    )

    captureStderr()
    // Two reads — warning should only appear once
    await readState(tmpDir)
    const outputAfterFirst = stderrOutput
    await readState(tmpDir)

    // Count occurrences of the warning string
    const matches = stderrOutput.match(/legacy.*progress\.json/gi) ?? []
    expect(matches.length).toBe(1)
    expect(outputAfterFirst).toBe(stderrOutput) // second read added nothing
  })
})

describe('writeState', () => {
  it('sets updated_at to current ISO time on write', async () => {
    const before = new Date().toISOString()
    const state = await readState(tmpDir)
    await writeState(tmpDir, state)
    const after = new Date().toISOString()

    const loaded = await readState(tmpDir)
    expect(loaded.updated_at >= before).toBe(true)
    expect(loaded.updated_at <= after).toBe(true)
  })

  it('writes pretty-printed JSON', async () => {
    const { readFile } = await import('node:fs/promises')
    const state = await readState(tmpDir)
    await writeState(tmpDir, state)
    const raw = await readFile(join(tmpDir, '.anvil', 'state.json'), 'utf-8')
    // Pretty-printed JSON contains newlines and indentation
    expect(raw).toContain('\n')
    expect(raw).toContain('  ')
  })
})

describe('updateState', () => {
  it('applies mutator and returns updated state', async () => {
    const result = await updateState(tmpDir, (s) => ({
      ...s,
      phase: 'plan' as const,
      feature_slug: 'my-feature',
    }))
    expect(result.phase).toBe('plan')
    expect(result.feature_slug).toBe('my-feature')
  })

  it('persists mutated state to disk', async () => {
    await updateState(tmpDir, (s) => ({ ...s, phase: 'verify' as const }))
    const loaded = await readState(tmpDir)
    expect(loaded.phase).toBe('verify')
  })

  it('updated_at advances on each updateState call', async () => {
    const first = await updateState(tmpDir, (s) => ({
      ...s,
      phase: 'spec' as const,
    }))
    // Small sleep to ensure time advances
    await new Promise((r) => setTimeout(r, 2))
    const second = await updateState(tmpDir, (s) => ({
      ...s,
      phase: 'plan' as const,
    }))
    expect(second.updated_at >= first.updated_at).toBe(true)
  })
})
