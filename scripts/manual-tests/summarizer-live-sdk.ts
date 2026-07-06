import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

if (!ANTHROPIC_API_KEY) {
  console.error(
    'ERROR: ANTHROPIC_API_KEY is not set.\n' +
      'Usage: ANTHROPIC_API_KEY=sk-ant-... bun run scripts/manual-tests/summarizer-live-sdk.ts',
  )
  process.exit(1)
}

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

const tmp = mkdtempSync(join(tmpdir(), 'anvil-summarizer-smoke-'))

try {
  // Set up a minimal git repo so the handler can derive a branch slug
  mkdirSync(join(tmp, '.git'), { recursive: true })
  writeFileSync(join(tmp, '.git', 'HEAD'), 'ref: refs/heads/main')

  const largeDump = buildLargeJsonDump()
  const wordCount = largeDump.split(/\s+/).filter(Boolean).length

  console.log(
    `[smoke] Input: ${largeDump.length} bytes / ${wordCount} words — invoking handleLargeOutput via tsx...`,
  )

  // Import the handler at runtime so we can pass it the real config
  // We invoke it in-process here (not via CLI subprocess) to avoid needing a
  // compiled build. The handler itself spawns the summarization subprocess.
  const handleLargeOutputModule = await import(
    '../../src/hooks/handlers/on-large-output.js'
  )
  const { handleLargeOutput } = handleLargeOutputModule

  const buildDefaultConfigModule = await import(
    '../../src/core/config/defaults.js'
  )
  const { buildDefaultConfig } = buildDefaultConfigModule

  const config = {
    ...buildDefaultConfig(),
    compression: { threshold_words: 100, strategy: 'summary' as const },
  }

  const result = await handleLargeOutput(
    {
      toolName: 'Bash',
      toolResult: largeDump,
      words: wordCount,
      tokens: Math.ceil(largeDump.length / 4),
      branch: 'main',
      cwd: tmp,
    },
    config,
  )

  if (result.skip) {
    console.error(
      '[smoke] FAIL: handler returned skip=true (threshold not reached?)',
    )
    process.exit(1)
  }

  if (!result.summary) {
    console.error('[smoke] FAIL: handler returned no summary')
    process.exit(1)
  }

  const summaryWordCount = result.summary.split(/\s+/).filter(Boolean).length
  console.log(`[smoke] Summary (${summaryWordCount} words):`)
  console.log('---')
  console.log(result.summary)
  console.log('---')

  if (summaryWordCount > 200) {
    console.error(
      `[smoke] FAIL: summary exceeds 200-word budget (got ${summaryWordCount} words)`,
    )
    process.exit(1)
  }

  if (result.stashedAt) {
    console.log(`[smoke] Stashed at: ${result.stashedAt}`)
  }

  console.log('[smoke] PASS')
  process.exit(0)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
