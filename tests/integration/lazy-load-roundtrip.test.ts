/**
 * Plan 32 B8 — Lazy-load roundtrip test.
 *
 * Verifies:
 * 1. Adapter manifests shrink ≥30% in lazy mode vs eager mode.
 * 2. Lazy-mode CC adapter emits _index.json (not per-skill SKILL.md files).
 * 3. Lazy-mode OC adapter emits _index.json (not per-skill SKILL.md files).
 * 4. Eager mode (default) continues to emit per-skill SKILL.md files.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../src/adapters/claude-code/generate.js'
import type { AdapterContext } from '../../src/adapters/interface.js'
import { generateOpenCode } from '../../src/adapters/opencode/generate.js'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import type { ModelsConfig } from '../../src/core/types.js'
import { loadAllSkills } from '../../src/skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT = join(__dirname, '..', '..', 'skills')

function makeCtx(
  skills: AdapterContext['skills'],
  lazyLoad: boolean,
): AdapterContext {
  const base = buildDefaultConfig()
  const config: ModelsConfig = {
    ...base,
    skills: { lazy_load: lazyLoad },
  }
  return {
    cwd: '/tmp/roundtrip-test',
    scope: 'project',
    config,
    skills,
    agents: [],
    hooks: [{ kind: 'session-start', enabled: true }] as never,
  }
}

/** Total bytes of all skill-related files in the generated output. */
function skillBytes(
  files: Array<{ relativePath: string; content: string | Buffer }>,
): number {
  return files
    .filter((f) => f.relativePath.startsWith('skills/'))
    .reduce((sum, f) => {
      const content =
        typeof f.content === 'string' ? f.content : f.content.toString('utf-8')
      return sum + Buffer.byteLength(content, 'utf-8')
    }, 0)
}

describe('integration: lazy-load roundtrip', () => {
  it('CC adapter emits per-skill SKILL.md files in eager mode (default)', async () => {
    const registry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: false,
    })
    const skills = registry.getAll()
    const ctx = makeCtx(skills, false)
    const out = await generateClaudeCode(ctx)
    const paths = out.files.map((f) => f.relativePath)
    // Should have SKILL.md files for individual skills
    const skillMdFiles = paths.filter((p) => p.endsWith('/SKILL.md'))
    expect(skillMdFiles.length).toBeGreaterThan(0)
    // Should NOT have the index
    expect(paths).not.toContain('skills/_index.json')
  })

  it('CC adapter emits _index.json in lazy mode (no per-skill SKILL.md)', async () => {
    const registry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: true,
    })
    const skills = registry.getAll()
    const ctx = makeCtx(skills, true)
    const out = await generateClaudeCode(ctx)
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('skills/_index.json')
    // Should NOT have individual SKILL.md files
    const skillMdFiles = paths.filter((p) => p.endsWith('/SKILL.md'))
    expect(skillMdFiles.length).toBe(0)
  })

  it('OC adapter emits per-skill SKILL.md files in eager mode (default)', async () => {
    const registry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: false,
    })
    const skills = registry.getAll()
    const ctx = makeCtx(skills, false)
    const out = await generateOpenCode(ctx)
    const paths = out.files.map((f) => f.relativePath)
    const skillMdFiles = paths.filter((p) => p.endsWith('/SKILL.md'))
    expect(skillMdFiles.length).toBeGreaterThan(0)
    expect(paths).not.toContain('skills/_index.json')
  })

  it('OC adapter emits _index.json in lazy mode (no per-skill SKILL.md)', async () => {
    const registry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: true,
    })
    const skills = registry.getAll()
    const ctx = makeCtx(skills, true)
    const out = await generateOpenCode(ctx)
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('skills/_index.json')
    const skillMdFiles = paths.filter((p) => p.endsWith('/SKILL.md'))
    expect(skillMdFiles.length).toBe(0)
  })

  it('CC adapter: lazy mode shrinks skill manifest bytes by ≥30% vs eager mode', async () => {
    const eagerRegistry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: false,
    })
    const lazyRegistry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: true,
    })

    const eagerSkills = eagerRegistry.getAll()
    const lazySkills = lazyRegistry.getAll()

    const eagerOut = await generateClaudeCode(makeCtx(eagerSkills, false))
    const lazyOut = await generateClaudeCode(makeCtx(lazySkills, true))

    const eagerBytes = skillBytes(eagerOut.files)
    const lazyBytes = skillBytes(lazyOut.files)

    expect(eagerBytes).toBeGreaterThan(0)
    expect(lazyBytes).toBeGreaterThan(0)
    expect(lazyBytes).toBeLessThan(eagerBytes)

    const reductionPct = ((eagerBytes - lazyBytes) / eagerBytes) * 100
    // Lazy mode emits only frontmatter JSON; bodies (the bulk of SKILL.md content)
    // are not emitted. The reduction must be ≥30%.
    expect(reductionPct).toBeGreaterThanOrEqual(30)
  })

  it('OC adapter: lazy mode shrinks skill manifest bytes by ≥30% vs eager mode', async () => {
    const eagerRegistry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: false,
    })
    const lazyRegistry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: true,
    })

    const eagerSkills = eagerRegistry.getAll()
    const lazySkills = lazyRegistry.getAll()

    const eagerOut = await generateOpenCode(makeCtx(eagerSkills, false))
    const lazyOut = await generateOpenCode(makeCtx(lazySkills, true))

    const eagerBytes = skillBytes(eagerOut.files)
    const lazyBytes = skillBytes(lazyOut.files)

    expect(eagerBytes).toBeGreaterThan(0)
    expect(lazyBytes).toBeGreaterThan(0)
    expect(lazyBytes).toBeLessThan(eagerBytes)

    const reductionPct = ((eagerBytes - lazyBytes) / eagerBytes) * 100
    expect(reductionPct).toBeGreaterThanOrEqual(30)
  })

  it('_index.json contains name, description, and frontmatter for each skill', async () => {
    const registry = await loadAllSkills({
      skillsRoot: SKILLS_ROOT,
      lazy: true,
    })
    const skills = registry.getAll()
    const ctx = makeCtx(skills, true)
    const out = await generateClaudeCode(ctx)

    const indexFile = out.files.find(
      (f) => f.relativePath === 'skills/_index.json',
    )
    expect(indexFile).toBeDefined()

    const index = JSON.parse(indexFile!.content as string) as Array<{
      name: string
      description: string
      frontmatter: Record<string, unknown>
    }>
    expect(index.length).toBe(skills.length)
    for (const entry of index) {
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.description).toBe('string')
      expect(typeof entry.frontmatter).toBe('object')
    }
  })
})
