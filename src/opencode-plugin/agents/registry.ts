import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseAgentFile } from './parse.js'
import type { ParsedAgent } from './schema.js'

/**
 * Load all valid Anvil agents from `${rootDir}/agents/*.md`.
 *
 * Invalid files (missing frontmatter, bad slug, Zod failures) are skipped
 * with a stderr warning. Missing or empty directories return an empty Map
 * without error (D-10).
 *
 * @param rootDir - Anvil root directory (typically ~/.anvil).
 * @returns Map from slug to ParsedAgent.
 */
export async function loadAgents(
  rootDir: string,
): Promise<Map<string, ParsedAgent>> {
  const agentsDir = join(rootDir, 'agents')
  const map = new Map<string, ParsedAgent>()

  let entries: string[]
  try {
    const dirents = await readdir(agentsDir)
    entries = dirents.filter((f) => f.endsWith('.md'))
  } catch {
    // Directory missing or unreadable — not an error (D-10).
    return map
  }

  await Promise.all(
    entries.map(async (filename) => {
      const filePath = join(agentsDir, filename)
      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch {
        process.stderr.write(
          `[anvil] opencode-plugin: could not read agent file ${filePath}\n`,
        )
        return
      }
      const agent = parseAgentFile(content, filePath)
      if (agent) {
        map.set(agent.slug, agent)
      }
    }),
  )

  return map
}
