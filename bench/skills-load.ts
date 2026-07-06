/**
 * Benchmark: eager vs lazy skill loading.
 * Measures total bytes emitted to manifests in each mode,
 * body-fetch count after a fixed access pattern, and total load duration.
 * Emits structured JSON to stdout.
 *
 * Usage: npm run bench
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateClaudeCode } from '../src/adapters/claude-code/generate.js'
import type { AdapterContext } from '../src/adapters/interface.js'
import { generateOpenCode } from '../src/adapters/opencode/generate.js'
import { buildDefaultConfig } from '../src/core/config/defaults.js'
import type { ModelsConfig } from '../src/core/types.js'
import { getBodyFetchCount, resetBodyFetchCount } from '../src/skills/body.js'
import { loadAllSkills } from '../src/skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT = join(__dirname, '..', 'skills')

interface ModeResult {
  mode: 'eager' | 'lazy'
  loadDurationMs: number
  totalSkills: number
  ccManifestBytes: number
  ocManifestBytes: number
  skillSectionBytes: number
  bodiesFetched: number
}

function skillSectionBytes(
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

function totalBytes(
  files: Array<{ relativePath: string; content: string | Buffer }>,
): number {
  return files.reduce((sum, f) => {
    const content =
      typeof f.content === 'string' ? f.content : f.content.toString('utf-8')
    return sum + Buffer.byteLength(content, 'utf-8')
  }, 0)
}

function makeCtx(
  skills: AdapterContext['skills'],
  lazyLoad: boolean,
): AdapterContext {
  const base = buildDefaultConfig()
  const config: ModelsConfig = { ...base, skills: { lazy_load: lazyLoad } }
  return {
    cwd: '/tmp/bench',
    scope: 'project',
    config,
    skills,
    agents: [],
    hooks: [{ kind: 'session-start', enabled: true }] as never,
  }
}

async function runMode(lazy: boolean): Promise<ModeResult> {
  resetBodyFetchCount()
  const mode: 'eager' | 'lazy' = lazy ? 'lazy' : 'eager'
  const loadStart = performance.now()
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT, lazy })
  const loadDurationMs = performance.now() - loadStart
  const skills = registry.getAll()

  // Fixed access pattern: fetch the first 3 skill bodies
  // (simulates a session that uses a few skills)
  const { getSkillBody } = await import('../src/skills/body.js')
  const sample = skills.slice(0, 3)
  for (const skill of sample) {
    await getSkillBody(skill)
  }
  const bodiesFetched = getBodyFetchCount()

  const ctx = makeCtx(skills, lazy)
  const ccOut = await generateClaudeCode(ctx)
  const ocOut = await generateOpenCode(ctx)

  return {
    mode,
    loadDurationMs,
    totalSkills: skills.length,
    ccManifestBytes: totalBytes(ccOut.files),
    ocManifestBytes: totalBytes(ocOut.files),
    skillSectionBytes: skillSectionBytes(ccOut.files),
    bodiesFetched,
  }
}

export async function runSkillsLoadBenchmark(): Promise<{
  eager: ModeResult
  lazy: ModeResult
  ccReductionPct: number
  ocReductionPct: number
  skillSectionReductionPct: number
}> {
  const eager = await runMode(false)
  const lazy = await runMode(true)

  const ccReductionPct =
    ((eager.ccManifestBytes - lazy.ccManifestBytes) / eager.ccManifestBytes) *
    100
  const ocReductionPct =
    ((eager.ocManifestBytes - lazy.ocManifestBytes) / eager.ocManifestBytes) *
    100
  const skillSectionReductionPct =
    ((eager.skillSectionBytes - lazy.skillSectionBytes) /
      eager.skillSectionBytes) *
    100

  return {
    eager,
    lazy,
    ccReductionPct,
    ocReductionPct,
    skillSectionReductionPct,
  }
}
