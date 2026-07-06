/**
 * ANV-0247 — Experimental stash integration tests.
 *
 * Tests for stashLargeOutput and the on-large-output hook's spill behavior
 * when the experimental build is active (stash target available).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import type { ModelsConfig } from '../../../../src/core/types.js'
import { stashLargeOutput } from '../../../../src/experimental/notepads/core/stash.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

function makeTmp(): string {
  const tmp = createTestTmpDir('compression-stash')
  return tmp
}

function buildLargeDiff(fileCount = 5, linesPerFile = 20): string {
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
    files.push(hunks.join('\n'))
  }
  return files.join('\n\n')
}

describe('compression-stash (experimental)', () => {
  it('stashLargeOutput writes to .anvil/notepads/<branch>/large-outputs.md', async () => {
    const cwd = makeTmp()
    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const pointer = await stashLargeOutput(cwd, 'main', 'Bash', 'test content')

    expect(pointer).toContain('large-outputs.md')
    expect(pointer).toContain('.anvil/notepads/')

    expect(existsSync(join(cwd, pointer.split('#')[0]))).toBe(true)
  })

  it('stash file contains raw tool output', async () => {
    const cwd = makeTmp()
    const rawContent = buildLargeDiff(3, 10)

    await stashLargeOutput(cwd, 'feature-branch', 'Read', rawContent)

    const notepadsDir = join(cwd, '.anvil', 'notepads')
    expect(existsSync(notepadsDir)).toBe(true)
    const { readdirSync } = await import('node:fs')
    const branches = readdirSync(notepadsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    expect(branches.length).toBeGreaterThan(0)

    const stashPath = join(notepadsDir, branches[0], 'large-outputs.md')
    expect(existsSync(stashPath)).toBe(true)
    const stashContent = readFileSync(stashPath, 'utf-8')
    expect(stashContent).toContain('src/module0/index.ts')
  })

  it('stashedAt pointer format: .anvil/notepads/<slug>/large-outputs.md#<anchor>', async () => {
    const cwd = makeTmp()
    const pointer = await stashLargeOutput(cwd, 'main', 'Read', 'content')
    expect(pointer).toMatch(/^\.anvil\/notepads\/[^/]+\/large-outputs\.md#.+$/)
  })

  it('handleLargeOutput returns defined stashedAt when experimental stash is present', async () => {
    const { handleLargeOutput } = await import(
      '../../../../src/hooks/handlers/on-large-output.js'
    )
    const cwd = makeTmp()
    mkdirSync(join(cwd, '.git'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main')

    const largeDiff = buildLargeDiff(5, 20)
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

    expect(result.skip).toBeUndefined()
    expect(result.summary).toBeDefined()
    // In the experimental build, stashedAt is defined.
    expect(result.stashedAt).toBeDefined()
    expect(result.stashedAt).toContain('large-outputs.md')
  })
})
