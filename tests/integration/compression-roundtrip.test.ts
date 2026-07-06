import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import type { ModelsConfig } from '../../src/core/types.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function makeTmp(): string {
  const tmp = createTestTmpDir('compression')
  return tmp
}

// Build a large diff (≈10KB) to feed through the handler
function buildLargeDiff(fileCount = 20, linesPerFile = 30): string {
  const files: string[] = []
  for (let i = 0; i < fileCount; i++) {
    const fileName = `src/module${i}/index.ts`
    const hunks: string[] = [
      `diff --git a/${fileName} b/${fileName}`,
      `index abc${i}..def${i} 100644`,
      `--- a/${fileName}`,
      `+++ b/${fileName}`,
      `@@ -1,${linesPerFile} +1,${linesPerFile + 2} @@`,
    ]
    for (let j = 0; j < linesPerFile; j++) {
      hunks.push(` export const value${j} = '${j}'`)
    }
    hunks.push(`+export const newValue${i} = 'added by on-large-output test'`)
    hunks.push(`+export const anotherValue${i} = 'second addition'`)
    files.push(hunks.join('\n'))
  }
  return files.join('\n\n')
}

describe('compression-roundtrip', () => {
  it('handler returns summary when words exceed threshold', async () => {
    const { handleLargeOutput } = await import(
      '../../src/hooks/handlers/on-large-output.js'
    )
    const cwd = makeTmp()

    // Need a git repo so branch detection works
    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const largeDiff = buildLargeDiff(20, 30)
    const words = largeDiff.split(/\s+/).filter(Boolean).length

    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 100, strategy: 'diffstat' },
    }

    const result = await handleLargeOutput(
      {
        toolName: 'Bash',
        toolResult: largeDiff,
        words,
        tokens: Math.ceil(largeDiff.length / 4),
        branch: 'main',
        cwd,
      },
      config,
    )

    // Must produce a summary, not skip.
    // ANV-0247: stashedAt is gated to the experimental build (no-op in default).
    // We do not assert on stashedAt here — its value depends on whether the
    // experimental stash module is present at import time.
    expect(result.skip).toBeUndefined()
    expect(result.summary).toBeDefined()
    expect(result.summary!.length).toBeGreaterThan(0)
  })

  it('dispatcher fires on-large-output after post-tool-use when threshold exceeded', async () => {
    const { dispatch } = await import('../../src/hooks/dispatcher.js')
    const { loadAllHooks } = await import('../../src/hooks/load-all.js')
    const cwd = makeTmp()

    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const largeDiff = buildLargeDiff(10, 25)
    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 50, strategy: 'diffstat' },
      // Enable post-tool-use hook
      disabled: {
        skills: [],
        hooks: [],
        agents: [],
      },
    }

    const registry = loadAllHooks({ config })

    const result = await dispatch(registry, {
      kind: 'post-tool-use',
      cwd,
      config,
      env: {},
      payload: {
        tool: 'Bash',
        result: largeDiff,
      },
    })

    // contextMutation must be set; summary is present.
    // ANV-0247: stashedAt is gated to the experimental build — not asserted here.
    expect(result.contextMutation).toBeDefined()
    expect(result.contextMutation?.summary).toBeDefined()
  })

  it('dispatcher does not mutate context when words below threshold', async () => {
    const { dispatch } = await import('../../src/hooks/dispatcher.js')
    const { loadAllHooks } = await import('../../src/hooks/load-all.js')
    const cwd = makeTmp()

    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 10000, strategy: 'summary' },
      disabled: { skills: [], hooks: [], agents: [] },
    }

    const registry = loadAllHooks({ config })

    const result = await dispatch(registry, {
      kind: 'post-tool-use',
      cwd,
      config,
      env: {},
      payload: {
        tool: 'Read',
        result: 'short output',
      },
    })

    expect(result.contextMutation).toBeUndefined()
  })

  it('large-output handler returns summary regardless of stash gating', async () => {
    const { handleLargeOutput } = await import(
      '../../src/hooks/handlers/on-large-output.js'
    )
    const cwd = makeTmp()

    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const largeText = 'token '.repeat(200) // 200 words, above a threshold of 100

    const config: ModelsConfig = {
      ...buildDefaultConfig(),
      compression: { threshold_words: 100, strategy: 'summary' },
    }

    const result = await handleLargeOutput(
      {
        toolName: 'Read',
        toolResult: largeText,
        words: 200,
        tokens: 200,
        branch: 'main',
        cwd,
      },
      config,
    )

    // ANV-0247: stashedAt is gated to the experimental build — not asserted here.
    expect(result.summary).toBeDefined()
  })
})
