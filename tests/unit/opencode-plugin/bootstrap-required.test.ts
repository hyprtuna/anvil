/**
 * ANV-0013 regression — the OpenCode plugin MUST fail loud (throw) when the
 * `skills/using-anvil/SKILL.md` bootstrap is missing or empty.
 *
 * Prior to ANV-0013, AnvilPlugin() silently swallowed a missing bootstrap so
 * every OC session booted without the Anvil discovery doctrine. This test
 * exercises the production AnvilPlugin() path against a real temp dir and
 * asserts the contract.
 *
 * Hermetic: ANVIL_ROOT_OVERRIDE points at a mkdtempSync dir; never touches
 * real ~/.anvil/.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnvilPlugin } from '../../../src/opencode-plugin/index.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

let anvilRoot: string

beforeEach(() => {
  anvilRoot = createTestTmpDir('bootstrap')
  process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
})

afterEach(() => {
  // biome-ignore lint/performance/noDelete: process.env.X = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
  delete process.env.ANVIL_ROOT_OVERRIDE
  rmSync(anvilRoot, { recursive: true, force: true })
})

describe('AnvilPlugin bootstrap requirement', () => {
  it('throws when skills/using-anvil/SKILL.md does not exist', async () => {
    // No bootstrap file staged.
    await expect(AnvilPlugin()).rejects.toThrow()
  })

  it('throws when skills/using-anvil/SKILL.md is empty', async () => {
    mkdirSync(join(anvilRoot, 'skills', 'using-anvil'), { recursive: true })
    writeFileSync(
      join(anvilRoot, 'skills', 'using-anvil', 'SKILL.md'),
      '   \n',
      'utf-8',
    )
    await expect(AnvilPlugin()).rejects.toThrow(/bootstrap skill is empty/i)
  })

  it('initialises successfully when bootstrap is present and non-empty', async () => {
    mkdirSync(join(anvilRoot, 'skills', 'using-anvil'), { recursive: true })
    writeFileSync(
      join(anvilRoot, 'skills', 'using-anvil', 'SKILL.md'),
      '# using-anvil\n\nbootstrap doctrine here\n',
      'utf-8',
    )
    const plugin = await AnvilPlugin()
    expect(plugin).toBeDefined()
    expect(typeof plugin.config).toBe('function')
  })

  it('injects bootstrap content into the first user message via transform', async () => {
    mkdirSync(join(anvilRoot, 'skills', 'using-anvil'), { recursive: true })
    const sentinel = 'BOOTSTRAP_CONTENT_SENTINEL_a1b2c3'
    writeFileSync(
      join(anvilRoot, 'skills', 'using-anvil', 'SKILL.md'),
      `# using-anvil\n\n${sentinel}\n`,
      'utf-8',
    )
    const plugin = await AnvilPlugin()
    const transform = plugin.experimental?.chat?.messages?.transform
    expect(transform).toBeDefined()
    if (!transform) throw new Error('transform not registered')
    const out = await transform([{ role: 'user', content: 'hello' }])
    const userMsg = out.find((m) => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg!.content).toContain(sentinel)
  })

  it('production tree has skills/using-anvil/SKILL.md staged with non-empty content', async () => {
    // Cross-check against the real source tree — the bootstrap content must
    // exist in source so installer-staging produces a working ~/.anvil/.
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const repoRoot = resolve(here, '..', '..', '..')
    const sourcePath = join(repoRoot, 'skills', 'using-anvil', 'SKILL.md')
    const content = readFileSync(sourcePath, 'utf-8')
    expect(content.trim().length).toBeGreaterThan(100)
    expect(content).toMatch(/name:\s*using-anvil/)
  })
})
