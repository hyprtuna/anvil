/**
 * Phase 3 (v0.11.2 Bundle A) — end-to-end smoke test for anvil init --target opencode.
 *
 * D-10: Uses the real binary (bin/anvil.cjs) via execFileSync.
 * D-11: HOME is overridden to a mkdtempSync dir; never touches real ~/.anvil/.
 * D-09: Asserts the plugin URL is a file:// path ending in index.js.
 * D-12: No new public API surface — test-only.
 *
 * The describe block is skipped unless dist/opencode-plugin/index.js exists
 * (i.e. after npm run build). CI always runs npm run build before npm test.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const __dirname_test = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname_test, '../../')
const ANVIL_BIN = join(REPO_ROOT, 'bin', 'anvil.cjs')
const PLUGIN_DIST = join(REPO_ROOT, 'dist', 'opencode-plugin', 'index.js')

describe.skipIf(!existsSync(PLUGIN_DIST))(
  'cli init --target opencode (smoke)',
  () => {
    let home: string
    let project: string

    beforeAll(() => {
      home = createTestTmpDir('oc-home')
      project = createTestTmpDir('oc-proj')
    })

    afterAll(() => {
      rmSync(home, { recursive: true, force: true })
      rmSync(project, { recursive: true, force: true })
    })

    it('global init produces a built JS plugin at ~/.anvil/plugins/opencode/index.js', () => {
      execFileSync(
        ANVIL_BIN,
        ['init', '--target', 'opencode', '--scope', 'global', '--yes'],
        {
          env: { ...process.env, HOME: home },
          stdio: 'pipe',
        },
      )
      const pluginPath = join(home, '.anvil', 'plugins', 'opencode', 'index.js')
      expect(existsSync(pluginPath)).toBe(true)

      const head = readFileSync(pluginPath, 'utf-8').slice(0, 400)
      // Must be compiled JS — no TypeScript syntax
      expect(head).not.toMatch(/\bimport type\b/)
      expect(head).not.toMatch(/:\s*string\s*\)/)
    })

    it('project init wires .opencode/opencode.json with absolute file:// plugin URL pointing at index.js', () => {
      execFileSync(ANVIL_BIN, ['init', '--target', 'opencode', '--yes'], {
        cwd: project,
        env: { ...process.env, HOME: home },
        stdio: 'pipe',
      })
      const cfgPath = join(project, '.opencode', 'opencode.json')
      expect(existsSync(cfgPath)).toBe(true)

      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as {
        plugin?: string[]
      }
      expect(Array.isArray(cfg.plugin)).toBe(true)
      expect(
        cfg.plugin!.some(
          (p) =>
            p.startsWith('file://') && p.includes('plugins/opencode/index.js'),
        ),
      ).toBe(true)
      // URL must be absolute (no tilde expansion needed by OpenCode)
      expect(cfg.plugin!.every((p) => !p.includes('~'))).toBe(true)
    })

    it('built plugin registers bootstrap and skills via config() against the real install layout', async () => {
      const anvilRoot = join(home, '.anvil')
      const pluginPath = join(anvilRoot, 'plugins', 'opencode', 'index.js')

      // ANV-0013: assert against the real installer output. No fixture
      // manifest is written here — we verify the bootstrap skill landed on
      // disk and the plugin can discover real installed skill dirs by name.
      // Real installer output of `anvil init --target opencode --scope global`
      // in the previous test should produce:
      //   ~/.anvil/skills/using-anvil/SKILL.md   (bootstrap)
      //   ~/.anvil/skills/<name>/SKILL.md        (per skill)
      //
      // The previous version of this test wrote a fake manifest.json to
      // exercise readEnabledSkills(); that masked ANV-0013 because the plugin
      // then never had to resolve the missing using-anvil/SKILL.md. The real
      // installer must now stage that file or the plugin throws.
      const bootstrapPath = join(anvilRoot, 'skills', 'using-anvil', 'SKILL.md')
      expect(existsSync(bootstrapPath)).toBe(true)
      // Bootstrap content must not be empty (regression-test for ANV-0013).
      expect(
        readFileSync(bootstrapPath, 'utf-8').trim().length,
      ).toBeGreaterThan(0)

      // ANVIL_ROOT_OVERRIDE is read at AnvilPlugin() call time.
      process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
      try {
        const mod = await import(`file://${pluginPath}`)
        const plugin = await (
          mod.server as (ctx?: unknown) => Promise<{
            config(cfg: { skills?: { paths?: string[] } }): Promise<void>
          }>
        )()
        const cfg: { skills?: { paths?: string[] } } = {}
        // Plugin init must NOT have thrown (would fail above). config() must
        // succeed even when no manifest.json is present (graceful fallback).
        await plugin.config(cfg)

        // Bootstrap skills/ dir always present.
        expect(cfg.skills?.paths?.length ?? 0).toBeGreaterThanOrEqual(1)
        expect(cfg.skills?.paths).toContain(join(anvilRoot, 'skills'))
      } finally {
        // biome-ignore lint/performance/noDelete: process.env.X = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
        delete process.env.ANVIL_ROOT_OVERRIDE
      }
    })

    it('graceful no-op when manifest is intentionally absent', async () => {
      // Create a fresh isolated anvilRoot with no manifest.json at all.
      const isolatedRoot = createTestTmpDir('oc-nomanifest')
      mkdirSync(join(isolatedRoot, 'skills', 'using-anvil'), {
        recursive: true,
      })
      // ANV-0013: bootstrap is a hard contract; stage it even in the
      // no-manifest case (the installer always writes it in production).
      const { writeFileSync: writeFileSync2 } = await import('node:fs')
      writeFileSync2(
        join(isolatedRoot, 'skills', 'using-anvil', 'SKILL.md'),
        '# using-anvil\n',
      )

      const pluginPath = join(home, '.anvil', 'plugins', 'opencode', 'index.js')
      process.env.ANVIL_ROOT_OVERRIDE = isolatedRoot
      try {
        const mod = await import(`file://${pluginPath}`)
        const plugin = await (
          mod.server as (ctx?: unknown) => Promise<{
            config(cfg: { skills?: { paths?: string[] } }): Promise<void>
          }>
        )()
        const cfg: { skills?: { paths?: string[] } } = {}
        // Should not throw even with no manifest
        await expect(plugin.config(cfg)).resolves.not.toThrow()
        // Bootstrap path always added
        expect(cfg.skills?.paths?.length ?? 0).toBeGreaterThanOrEqual(1)
      } finally {
        // biome-ignore lint/performance/noDelete: process.env.X = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
        delete process.env.ANVIL_ROOT_OVERRIDE
        rmSync(isolatedRoot, { recursive: true, force: true })
      }
    })
  },
)
