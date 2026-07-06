import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendEntry } from '../../src/core/notepads/index.js'
import type { HookContext, ModelsConfig } from '../../src/core/types.js'
import { sessionStartHandler } from '../../src/hooks/handlers/session-start.js'

// Mock detectBranch to return a predictable branch name
vi.mock('../../src/core/notepads/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/notepads/index.js')>()
  return {
    ...actual,
    detectBranch: vi.fn().mockReturnValue('test-feature-branch'),
  }
})

let tmpDir: string

// Minimal ModelsConfig for test context
const minimalConfig = {
  version: '1',
  defaults: {
    model: 'claude-sonnet',
    effort: 'medium',
    max_tokens: 4096,
    fallback_chain: [],
  },
  groups: {},
  overrides: {},
  effort_levels: {
    low: { description: 'low' },
    medium: { description: 'medium' },
    high: { description: 'high' },
    xhigh: { description: 'xhigh' },
    max: { description: 'max' },
  },
  model_aliases: {
    fast: 'claude-haiku',
    balanced: 'claude-sonnet',
    powerful: 'claude-opus',
    default: 'claude-sonnet',
  },
  disabled: { skills: [], hooks: [], agents: [] },
} as unknown as ModelsConfig

function makeCtx(cwd: string): HookContext {
  return {
    kind: 'session-start',
    cwd,
    config: minimalConfig,
    env: {},
    payload: {},
  }
}

beforeEach(async () => {
  tmpDir = join(tmpdir(), `anvil-notepad-ss-test-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('notepad-session-start integration', () => {
  it('returns HookResult without systemInsert when no notepad exists', async () => {
    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.exitCode).toBe(0)
    expect(result.systemInsert).toBeUndefined()
  })

  it('emits systemInsert with recent-context content when notepad exists', async () => {
    // Write an entry to the notepad for the mocked branch
    const entry = {
      section: 'learnings' as const,
      headline: 'CC additionalContext is the right injection point',
      source: 'researcher',
      timestamp: new Date().toISOString(),
    }
    await appendEntry(tmpDir, 'test-feature-branch', entry)

    const result = await sessionStartHandler(makeCtx(tmpDir))

    expect(result.exitCode).toBe(0)
    expect(result.systemInsert).toBeDefined()
    expect(result.systemInsert).toContain(
      'CC additionalContext is the right injection point',
    )
  })

  it('emits systemInsert bounded to ≤500 tokens (2000 chars)', async () => {
    // Write many entries to force a large notepad
    for (let i = 0; i < 30; i++) {
      const entry = {
        section: 'learnings' as const,
        headline: `Learning entry number ${i} with a somewhat long headline text`,
        source: 'researcher',
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      }
      // Reset day to avoid dedup
      entry.timestamp = new Date(
        Date.now() - i * 25 * 60 * 60 * 1000,
      ).toISOString()
      await appendEntry(tmpDir, 'test-feature-branch', entry)
    }

    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.systemInsert).toBeDefined()
    const charCount = result.systemInsert!.length
    // Should be capped to ≤2000 chars plus some truncation suffix tolerance
    expect(charCount).toBeLessThanOrEqual(2200)
  })

  it('returns systemInsert: undefined when notepad is empty file', async () => {
    const dir = join(tmpDir, '.anvil', 'notepads', 'test-feature-branch')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'recent-context.md'), '', 'utf-8')

    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.systemInsert).toBeUndefined()
  })

  it('continues normally even when notepad read fails', async () => {
    // Create a directory where the file should be (read will fail)
    const dir = join(tmpDir, '.anvil', 'notepads', 'test-feature-branch')
    await mkdir(dir, { recursive: true })
    // Create a directory named recent-context.md (not a file) to force read failure
    await mkdir(join(dir, 'recent-context.md'), { recursive: true })

    const result = await sessionStartHandler(makeCtx(tmpDir))
    // Should not crash; exitCode 0 still
    expect(result.exitCode).toBe(0)
  })

  it('HookResult shape has all required fields', async () => {
    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result).toHaveProperty('exitCode')
    expect(result).toHaveProperty('message')
    expect(result.exitCode).toBeTypeOf('number')
  })
})
