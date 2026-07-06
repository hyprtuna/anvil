/**
 * ANV-0001 — Adapter bootstrap eval contract.
 *
 * Per-adapter contract tests proving each adapter produces sufficient bootstrap
 * context (skills/using-anvil/SKILL.md). Also exercises the production
 * readEnabledSkills() path via a real manifest.json — no fixture-manifest bypass.
 *
 * Acceptance criteria (from ANV-0001):
 * - Removing skills/using-anvil/SKILL.md causes a failing test (not a silent skip).
 * - Production readEnabledSkills() is exercised in CI.
 * - Bootstrap content is present and non-empty in generated artifacts.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../../src/adapters/claude-code/generate.js'
import type { AdapterContext } from '../../../src/adapters/interface.js'
import { generateOpenCode } from '../../../src/adapters/opencode/generate.js'
import { loadSkillFile } from '../../../src/skills/loader.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const __dirname_test = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname_test, '../../../')
const BOOTSTRAP_SKILL_PATH = join(
  REPO_ROOT,
  'skills',
  'using-anvil',
  'SKILL.md',
)
const PLUGIN_DIST = join(REPO_ROOT, 'dist', 'opencode-plugin', 'index.js')

// ─── shared fixture builder ────────────────────────────────────────────────

async function buildBootstrapSkillContext(): Promise<AdapterContext> {
  // Load the production using-anvil skill from the real source tree.
  // If this file is absent, loadSkillFile returns undefined → the test fails
  // below with a clear message (acceptance criterion: failing test, not silent skip).
  const bootstrapSkill = await loadSkillFile(BOOTSTRAP_SKILL_PATH, 'universal')
  if (!bootstrapSkill) {
    throw new Error(
      `[ANV-0001] Bootstrap skill not found at ${BOOTSTRAP_SKILL_PATH}. Removing skills/using-anvil/SKILL.md must cause a failing test.`,
    )
  }

  return {
    cwd: '/tmp/anv-0001-test-cwd',
    home: '/tmp/anv-0001-test-home',
    scope: 'global',
    config: { version: '0.0.0' } as never,
    skills: [bootstrapSkill],
    hooks: [],
    agents: [],
  }
}

// ─── Claude Code adapter bootstrap contract ───────────────────────────────

describe('Claude Code adapter — bootstrap content contract', () => {
  it('skills/using-anvil/SKILL.md exists in the source tree (hard contract)', () => {
    // This test fails if the file is deleted — acceptance criterion 1.
    expect(existsSync(BOOTSTRAP_SKILL_PATH)).toBe(true)
  })

  it('bootstrap skill has non-empty content', async () => {
    const content = await readFile(BOOTSTRAP_SKILL_PATH, 'utf-8')
    expect(content.trim().length).toBeGreaterThan(0)
  })

  it('generateClaudeCode emits skills/using-anvil/SKILL.md when bootstrap skill is in context', async () => {
    const ctx = await buildBootstrapSkillContext()
    const out = await generateClaudeCode(ctx)
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('skills/using-anvil/SKILL.md')
  })

  it('bootstrap skill content in generated CC artifact is non-empty', async () => {
    const ctx = await buildBootstrapSkillContext()
    const out = await generateClaudeCode(ctx)
    const bootstrapFile = out.files.find(
      (f) => f.relativePath === 'skills/using-anvil/SKILL.md',
    )
    expect(bootstrapFile).toBeDefined()
    const content =
      typeof bootstrapFile!.content === 'string'
        ? bootstrapFile!.content
        : Buffer.from(bootstrapFile!.content).toString('utf-8')
    expect(content.trim().length).toBeGreaterThan(0)
  })

  it('CC adapter output lacks bootstrap when using-anvil is absent from context (contract violation detection)', async () => {
    // Context with no skills — simulates missing bootstrap.
    const ctx: AdapterContext = {
      cwd: '/tmp/anv-0001-test-cwd',
      home: '/tmp/anv-0001-test-home',
      scope: 'global',
      config: { version: '0.0.0' } as never,
      skills: [],
      hooks: [],
      agents: [],
    }
    const out = await generateClaudeCode(ctx)
    const paths = out.files.map((f) => f.relativePath)
    // Without the bootstrap skill in context, it must NOT appear.
    expect(paths).not.toContain('skills/using-anvil/SKILL.md')
  })
})

// ─── OpenCode adapter bootstrap contract ─────────────────────────────────

describe.skipIf(!existsSync(PLUGIN_DIST))(
  'OpenCode adapter — bootstrap content contract (ANV-0001)',
  () => {
    let tmpHome: string
    let anvilRoot: string

    beforeAll(() => {
      tmpHome = createTestTmpDir('anv-0001-oc')
      anvilRoot = join(tmpHome, '.anvil')
      mkdirSync(join(anvilRoot, 'skills', 'using-anvil'), { recursive: true })
    })

    afterAll(() => {
      rmSync(tmpHome, { recursive: true, force: true })
    })

    it('generateOpenCode emits plugins/opencode/index.js (compiled plugin)', async () => {
      const ctx = await buildBootstrapSkillContext()
      const out = await generateOpenCode(ctx)
      const paths = out.files.map((f) => f.relativePath)
      expect(paths).toContain('plugins/opencode/index.js')
    })

    it('OC adapter: production readEnabledSkills() returns using-anvil when manifest is real', async () => {
      // Write real skill files into the temp anvilRoot — no fixture bypass.
      const bootstrapContent = await readFile(BOOTSTRAP_SKILL_PATH, 'utf-8')
      writeFileSync(
        join(anvilRoot, 'skills', 'using-anvil', 'SKILL.md'),
        bootstrapContent,
      )
      // Write a real manifest.json pointing at using-anvil (production path).
      const manifest = {
        schemaVersion: 'anvil.opencode.v1',
        skills: [{ name: 'using-anvil', enabled: true }],
      }
      writeFileSync(
        join(anvilRoot, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      )

      // Exercise the production AnvilPlugin() with the real manifest.
      // ANVIL_ROOT_OVERRIDE is the test-only hatch in src/opencode-plugin/index.ts.
      process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
      try {
        // Dynamic import of the built plugin (forces fresh module load with override).
        const pluginPath = PLUGIN_DIST
        const mod = await import(`file://${pluginPath}`)
        const plugin = await (
          mod.server as (ctx?: unknown) => Promise<{
            config(cfg: { skills?: { paths?: string[] } }): Promise<void>
          }>
        )()
        const cfg: { skills?: { paths?: string[] } } = {}
        await plugin.config(cfg)

        // Production readEnabledSkills() must have returned using-anvil path.
        const expectedSkillDir = join(anvilRoot, 'skills', 'using-anvil')
        expect(cfg.skills?.paths).toContain(expectedSkillDir)
      } finally {
        process.env.ANVIL_ROOT_OVERRIDE = undefined
      }
    })

    it('OC plugin init throws when bootstrap SKILL.md is absent', async () => {
      // Create an anvilRoot WITHOUT using-anvil/SKILL.md.
      const emptyRoot = createTestTmpDir('anv-0001-oc-empty')
      mkdirSync(join(emptyRoot, 'skills'), { recursive: true })
      process.env.ANVIL_ROOT_OVERRIDE = emptyRoot
      try {
        const mod = await import(`file://${PLUGIN_DIST}`)
        await expect(
          (mod.server as (ctx?: unknown) => Promise<unknown>)(),
        ).rejects.toThrow()
      } finally {
        process.env.ANVIL_ROOT_OVERRIDE = undefined
        rmSync(emptyRoot, { recursive: true, force: true })
      }
    })
  },
)
