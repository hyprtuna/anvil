/**
 * Plan 33 C4 — Integration test: compression summarization roundtrip.
 *
 * Feeds a large JSON dump through the dispatcher with strategy: 'summary'.
 * Stubs out the subprocess so the test is deterministic and fast.
 * An optional live SDK path is gated behind ANVIL_LIVE_SDK_TESTS=1 (skipped in CI).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import type { ModelsConfig } from '../../src/core/types.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

// We stub child_process at the module level so imports of on-large-output
// get the mock automatically.
vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('main'),
  spawnSync: vi.fn(),
}))

const tmps: string[] = []

function makeTmp(): string {
  const tmp = createTestTmpDir('summarizer-roundtrip')
  tmps.push(tmp)
  return tmp
}

afterEach(() => {
  for (const tmp of tmps.splice(0)) {
    rmSync(tmp, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

/** Build a large JSON dump (≈10KB) to trigger the summarization path. */
function buildLargeJsonDump(): string {
  const obj: Record<string, unknown> = {
    model: 'claude-haiku-4-5',
    exitCode: 0,
    threshold_words: 5000,
    strategy: 'summary',
    errors: [
      { type: 'ZodError', message: 'Invalid input at .model', path: ['model'] },
    ],
    files: Array.from({ length: 200 }, (_, i) => `src/module${i}/index.ts`),
    metadata: {
      buildTime: '2026-04-26T07:00:00Z',
      version: '0.9.0',
      checksum: 'abc123def456',
    },
    logs: Array.from(
      { length: 100 },
      (_, i) => `[INFO] step ${i}: processed module${i}`,
    ),
  }
  return JSON.stringify(obj, null, 2)
}

describe('compression-summarizer-roundtrip (Plan 33 C4)', () => {
  it('subprocess summary lands in conversation context when spawnSync succeeds', async () => {
    const { spawnSync } = await import('node:child_process')
    const mockedSpawnSync = vi.mocked(spawnSync)

    const cannedSummary =
      '[output — 50 lines / 10.2 KB]\nJSON fields: model, exitCode, threshold_words, strategy, errors, files\nErrors: ZodError'

    // Runtime detection: bun found
    // Subprocess invocation: success with canned summary
    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '1.3.13',
        stderr: '',
        error: undefined,
        pid: 1,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: cannedSummary,
        stderr: '',
        error: undefined,
        pid: 2,
        output: [],
        signal: null,
      })

    const { handleLargeOutput } = await import(
      '../../src/hooks/handlers/on-large-output.js'
    )
    const cwd = makeTmp()
    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const largeDump = buildLargeJsonDump()
    const words = largeDump.split(/\s+/).filter(Boolean).length

    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 100, strategy: 'summary' },
    }

    const result = await handleLargeOutput(
      {
        toolName: 'Bash',
        toolResult: largeDump,
        words,
        tokens: Math.ceil(largeDump.length / 4),
        branch: 'main',
        cwd,
      },
      config,
    )

    // The subprocess summary must land in the result
    expect(result.skip).toBeUndefined()
    expect(result.summary).toBe(cannedSummary)
    expect(result.stashedAt).toBeDefined()
    expect(result.stashedAt).toContain('large-outputs.md')

    // Verify the summary contains actionable signal (ZodError is preserved)
    expect(result.summary).toContain('ZodError')
  })

  it('mechanical fallback when subprocess fails — summary still lands in context', async () => {
    const { spawnSync } = await import('node:child_process')
    const mockedSpawnSync = vi.mocked(spawnSync)

    // Runtime detection: bun found; subprocess: fails
    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '1.3.13',
        stderr: '',
        error: undefined,
        pid: 1,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 2,
        stdout: '',
        stderr: 'timeout',
        error: undefined,
        pid: 2,
        output: [],
        signal: null,
      })

    const { handleLargeOutput } = await import(
      '../../src/hooks/handlers/on-large-output.js'
    )
    const cwd = makeTmp()
    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const largeDump = buildLargeJsonDump()
    const words = largeDump.split(/\s+/).filter(Boolean).length

    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 100, strategy: 'summary' },
    }

    const result = await handleLargeOutput(
      {
        toolName: 'Bash',
        toolResult: largeDump,
        words,
        tokens: Math.ceil(largeDump.length / 4),
        branch: 'main',
        cwd,
      },
      config,
    )

    // Mechanical fallback must still produce a summary
    expect(result.skip).toBeUndefined()
    expect(result.summary).toBeDefined()
    expect(result.summary!.length).toBeGreaterThan(0)
    expect(result.stashedAt).toBeDefined()
    // Mechanical summary has the tool name header
    expect(result.summary).toContain('Bash')
  })

  it('strategy: diffstat keeps mechanical path (no subprocess for diffs)', async () => {
    const { spawnSync } = await import('node:child_process')
    const mockedSpawnSync = vi.mocked(spawnSync)

    const { handleLargeOutput } = await import(
      '../../src/hooks/handlers/on-large-output.js'
    )
    const cwd = makeTmp()
    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const diff = Array.from({ length: 30 }, (_, i) =>
      [
        `diff --git a/src/module${i}.ts b/src/module${i}.ts`,
        '@@ -1,5 +1,6 @@',
        ' context line',
        '+added line',
        '-removed line',
      ].join('\n'),
    ).join('\n\n')

    const words = diff.split(/\s+/).filter(Boolean).length

    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 50, strategy: 'diffstat' },
    }

    await handleLargeOutput(
      {
        toolName: 'Bash',
        toolResult: diff,
        words,
        tokens: Math.ceil(diff.length / 4),
        branch: 'main',
        cwd,
      },
      config,
    )

    // spawnSync must not have been called with skill run args for diffstat
    const calls = mockedSpawnSync.mock.calls
    const skillRunCalls = calls.filter(
      (c) =>
        Array.isArray(c[1]) && (c[1] as string[]).includes('summarization'),
    )
    expect(skillRunCalls).toHaveLength(0)
  })
})

// Mocked subprocess test — always runs in CI (no env gate required).
// Real SDK coverage lives in scripts/manual-tests/summarizer-live-sdk.ts.
describe('compression-summarizer-roundtrip — subprocess contract (mocked)', () => {
  it('subprocess output ≤200 words is accepted as-is when spawnSync succeeds', async () => {
    const { spawnSync } = await import('node:child_process')
    const mockedSpawnSync = vi.mocked(spawnSync)

    // Build a canned summary that is well within the 200-word budget
    const shortWords = Array.from({ length: 50 }, (_, i) => `word${i}`).join(
      ' ',
    )
    const cannedSummary = `[output — 50 lines / 10.2 KB]\n${shortWords}`

    // Runtime detection: bun found; subprocess: success with short summary
    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '1.3.13',
        stderr: '',
        error: undefined,
        pid: 1,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: cannedSummary,
        stderr: '',
        error: undefined,
        pid: 2,
        output: [],
        signal: null,
      })

    const { handleLargeOutput } = await import(
      '../../src/hooks/handlers/on-large-output.js'
    )
    const cwd = makeTmp()
    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const largeDump = buildLargeJsonDump()
    const words = largeDump.split(/\s+/).filter(Boolean).length

    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 100, strategy: 'summary' },
    }

    const result = await handleLargeOutput(
      {
        toolName: 'Bash',
        toolResult: largeDump,
        words,
        tokens: Math.ceil(largeDump.length / 4),
        branch: 'main',
        cwd,
      },
      config,
    )

    expect(result.skip).toBeUndefined()
    expect(result.summary).toBeDefined()
    const summaryWordCount = result.summary!.split(/\s+/).filter(Boolean).length
    expect(summaryWordCount).toBeLessThanOrEqual(200)
    expect(result.stashedAt).toBeDefined()
  })
})
