import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { note } from '@clack/prompts'
import { loadAllAgents } from '../../agents/load-all.js'
import { buildDefaultConfig } from '../../core/config/defaults.js'
import { loadAllHooks } from '../../hooks/load-all.js'
import { loadAllSkills } from '../../skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')

interface SurfaceCounts {
  universalSkills: number
  languageOverlays: number
  hooks: number
  agents: number
}

async function readSurfaceCounts(): Promise<SurfaceCounts> {
  const skillsRoot = join(REPO_ROOT, 'skills')
  const agentsRoot = join(REPO_ROOT, 'agents')
  const skillRegistry = await loadAllSkills({ skillsRoot })
  const agentRegistry = await loadAllAgents({ agentsRoot })
  const hookRegistry = loadAllHooks({ config: buildDefaultConfig() })
  const skills = skillRegistry.getAll()
  const universalSkills = skills.filter(
    (s) => s.frontmatter.language === 'universal',
  ).length
  const languageOverlays = skills.length - universalSkills
  return {
    universalSkills,
    languageOverlays,
    hooks: hookRegistry.getAll().length,
    agents: agentRegistry.getAll().length,
  }
}

export async function runWelcome(): Promise<void> {
  // Counts are read from the live registry to avoid drifting against the
  // shipped surface (was hardcoded "20 / 7 / 5" pre-v0.4 audit).
  let counts: SurfaceCounts
  try {
    counts = await readSurfaceCounts()
  } catch {
    // If registry load fails for any reason (test envs, partial trees),
    // fall back to a generic message rather than blocking the TUI.
    note(
      'Anvil installs a complete skill system: universal skills, language overlays, lifecycle hooks, and orchestrator agents.',
      'What this installs',
    )
    return
  }
  note(
    [
      'Anvil installs a complete skill system:',
      `  • ${counts.universalSkills} universal skills`,
      `  • ${counts.languageOverlays} language overlay skills`,
      `  • ${counts.hooks} lifecycle hooks`,
      `  • ${counts.agents} orchestrator agents`,
    ].join('\n'),
    'What this installs',
  )
}
