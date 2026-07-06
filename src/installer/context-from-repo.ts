import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AdapterContext } from '../adapters/interface.js'
import { loadAllAgents } from '../agents/load-all.js'
import { buildPreset } from '../core/config/presets.js'
import type { PresetName, Scope } from '../core/types.js'
import { loadAllHooks } from '../hooks/load-all.js'
import { loadAllSkills } from '../skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

export interface BuildContextOptions {
  sourceKind?: 'local' | 'git' | 'archive'
  sourceValue?: string
  scope?: Scope
  preset?: PresetName
  home?: string
}

export async function buildContextFromRepo(
  opts: BuildContextOptions = {},
): Promise<AdapterContext> {
  if (opts.sourceKind === 'git' || opts.sourceKind === 'archive') {
    throw new Error(
      `buildContextFromRepo: sourceKind '${opts.sourceKind}' is not yet implemented`,
    )
  }
  const cwd = opts.sourceValue ?? process.cwd()
  const scope = opts.scope ?? 'project'
  const config = buildPreset(opts.preset ?? 'balanced')
  const skillsRoot = join(REPO_ROOT, 'skills')
  const agentsRoot = join(REPO_ROOT, 'agents')

  const skillRegistry = await loadAllSkills({ skillsRoot })
  const hookRegistry = loadAllHooks({ config })
  const agentRegistry = await loadAllAgents({ agentsRoot })

  return {
    cwd,
    home: opts.home,
    scope,
    config,
    skills: skillRegistry.getAll(),
    hooks: hookRegistry.getAll(),
    agents: agentRegistry.getAll(),
  }
}
