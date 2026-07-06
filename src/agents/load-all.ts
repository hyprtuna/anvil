import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { applyDisambiguator } from '../core/disambiguator.js'
import { AgentRegistry } from '../core/registry/agent-registry.js'
import { AgentFrontmatter } from '../core/types.js'
import type { Agent } from '../core/types.js'

export interface LoadAllAgentsOptions {
  agentsRoot: string
}

export async function loadAllAgents(
  opts: LoadAllAgentsOptions,
): Promise<AgentRegistry> {
  const registry = new AgentRegistry()
  if (!existsSync(opts.agentsRoot)) return registry

  const entries = await readdir(opts.agentsRoot)
  for (const entry of entries) {
    // Skip doc files (CLAUDE.md, AGENTS.md, README.md) — agent files use lowercase names
    if (!entry.endsWith('.md') || /^[A-Z]/.test(entry)) continue
    const path = join(opts.agentsRoot, entry)
    const raw = await readFile(path, 'utf-8')
    const parsed = matter(raw)
    const result = AgentFrontmatter.safeParse(parsed.data)
    if (!result.success) {
      console.warn(
        `[anvil] agent load failed: ${path}\n${result.error.message}`,
      )
      continue
    }

    const frontmatter = result.data
    let originalDescription: string | undefined

    // ANV-0206 back-compat shim: disambiguator may be at root (pre-migration)
    // or under x-anvil (post-migration). Read from both locations.
    const disambiguator =
      frontmatter.disambiguator ?? frontmatter['x-anvil']?.disambiguator

    if (disambiguator) {
      try {
        const disambiguated = applyDisambiguator(
          disambiguator,
          frontmatter.description,
        )
        ;(frontmatter as { description: string }).description =
          disambiguated.description
        originalDescription = disambiguated.originalDescription
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[anvil] agent disambiguator error: ${path}\n  ${msg}`)
        continue
      }
    }

    const agent: Agent = {
      frontmatter,
      body: parsed.content.trim(),
      sourcePath: path,
      originalDescription,
    }
    registry.register(agent)
  }
  return registry
}
