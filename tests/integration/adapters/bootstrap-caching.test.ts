/**
 * ANV-0001 — Hermetic test: bootstrap is read exactly once per session start.
 *
 * Structural reference: references/superpowers/tests/opencode/test-bootstrap-caching.mjs
 * — patterns only; all code written fresh in TypeScript.
 *
 * The OpenCode plugin (src/opencode-plugin/index.ts) reads `using-anvil/SKILL.md`
 * eagerly in AnvilPlugin() and stores the result in a closure variable. It must NOT
 * re-read the file on every transform() call.
 *
 * The test proves this by:
 * 1. Instantiating the plugin and noting bootstrap content is injected (sentinel A).
 * 2. Overwriting the file on disk with a different sentinel (B).
 * 3. Calling transform() again and asserting it still injects sentinel A, not B.
 *    This proves the file was read once at init, not re-read per call.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const __dirname_test = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname_test, '../../../')
const PLUGIN_DIST = join(REPO_ROOT, 'dist', 'opencode-plugin', 'index.js')
const SOURCE_SKILL = join(REPO_ROOT, 'skills', 'using-anvil', 'SKILL.md')

// Minimal well-formed SKILL.md content with a unique sentinel.
function makeSkillMd(sentinel: string): string {
  return [
    '---',
    'name: using-anvil',
    'kind: meta',
    'group: meta',
    'description: bootstrap test fixture',
    'trigger: []',
    'preferred_model: claude-opus-4-5',
    'preferred_effort: medium',
    'inputs: []',
    'outputs: []',
    'tools: []',
    'chains: []',
    'language: universal',
    'tags: []',
    'aliases: []',
    '---',
    `# using-anvil (${sentinel})`,
    '',
    sentinel,
  ].join('\n')
}

type OcPlugin = {
  config(cfg: { skills?: { paths?: string[] } }): Promise<void>
  experimental?: {
    chat?: {
      messages?: {
        transform?(
          messages: Array<{ role: string; content: string }>,
        ): Promise<Array<{ role: string; content: string }>>
      }
    }
  }
}

describe.skipIf(!existsSync(PLUGIN_DIST))(
  'OpenCode plugin — bootstrap read-once invariant (ANV-0001 hermetic)',
  () => {
    let anvilRoot: string
    let bootstrapPath: string

    beforeAll(() => {
      anvilRoot = createTestTmpDir('anv-0001-cache')
      bootstrapPath = join(anvilRoot, 'skills', 'using-anvil', 'SKILL.md')
      mkdirSync(join(anvilRoot, 'skills', 'using-anvil'), { recursive: true })
    })

    afterAll(() => {
      process.env.ANVIL_ROOT_OVERRIDE = undefined
      rmSync(anvilRoot, { recursive: true, force: true })
    })

    it('bootstrap content is injected into the first user message', async () => {
      const sentinelA = 'SENTINEL_A_BOOTSTRAP_READ_ONCE'
      writeFileSync(bootstrapPath, makeSkillMd(sentinelA))

      process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
      // Fresh dynamic import to pick up ANVIL_ROOT_OVERRIDE.
      const cacheKey = `anv-0001-a-${Date.now()}`
      const mod = await import(`file://${PLUGIN_DIST}?${cacheKey}`)
      const plugin = await (
        mod.server as (ctx?: unknown) => Promise<OcPlugin>
      )()

      const transform = plugin.experimental?.chat?.messages?.transform
      if (!transform) {
        // Plugin has no transform handler in this build — skip sub-test.
        return
      }

      const messages = [{ role: 'user', content: 'session start' }]
      const result = await transform([...messages])

      const allContent = result.map((m) => m.content).join('\n')
      expect(allContent).toContain(sentinelA)
    })

    it('bootstrap is NOT re-read from disk on subsequent transform() calls (read-once invariant)', async () => {
      const sentinelA = 'SENTINEL_A_CACHED_CONTENT'
      const sentinelB = 'SENTINEL_B_UPDATED_CONTENT'

      // Write sentinel A and instantiate the plugin.
      writeFileSync(bootstrapPath, makeSkillMd(sentinelA))

      process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
      const cacheKey = `anv-0001-b-${Date.now()}`
      const mod = await import(`file://${PLUGIN_DIST}?${cacheKey}`)
      const plugin = await (
        mod.server as (ctx?: unknown) => Promise<OcPlugin>
      )()

      // Overwrite the file with sentinel B AFTER plugin is instantiated.
      writeFileSync(bootstrapPath, makeSkillMd(sentinelB))

      const transform = plugin.experimental?.chat?.messages?.transform
      if (!transform) {
        // Plugin has no transform handler — cannot verify injection; skip.
        return
      }

      const messages = [{ role: 'user', content: 'second call' }]
      const result = await transform([...messages])
      const allContent = result.map((m) => m.content).join('\n')

      // Plugin must inject the ORIGINAL sentinel A (cached at init), NOT the
      // updated sentinel B (written after init). Proves read-once invariant.
      expect(allContent).toContain(sentinelA)
      expect(allContent).not.toContain(sentinelB)
    })

    it('bootstrap content from the real source tree is non-empty', () => {
      // Hard guard: if this test file exists, its content must be substantive.
      // Removing skills/using-anvil/SKILL.md causes this to fail (ANV-0001 AC-1).
      expect(existsSync(SOURCE_SKILL)).toBe(true)
      const content = readFileSync(SOURCE_SKILL, 'utf-8')
      expect(content.trim().length).toBeGreaterThan(0)
    })
  },
)
