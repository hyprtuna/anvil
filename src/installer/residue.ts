import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ResidueFinding {
  path: string
  reason: string
}

export async function detectV1Residue(
  home: string,
  cwd: string,
): Promise<ResidueFinding[]> {
  const findings: ResidueFinding[] = []
  for (const root of [home, cwd]) {
    // v1 wrote .claude-plugin/plugin.json directly at install root (not inside ~/.anvil/plugins/claude-code/)
    const p = join(root, '.claude-plugin/plugin.json')
    if (existsSync(p)) {
      try {
        const content = JSON.parse(await readFile(p, 'utf-8')) as Record<
          string,
          unknown
        >
        if (content.name === 'anvil' && !content._anvilv2) {
          findings.push({
            path: p,
            reason:
              'v1 anvil plugin.json — use uninstall.sh --all --purge to clean',
          })
        }
      } catch {
        // ignore parse errors
      }
    }
    // v1 opencode.json had name: "anvil" and agents array
    const oc = join(root, '.opencode/opencode.json')
    if (existsSync(oc)) {
      try {
        const content = JSON.parse(await readFile(oc, 'utf-8')) as Record<
          string,
          unknown
        >
        if (content.name === 'anvil' && Array.isArray(content.agents)) {
          findings.push({
            path: oc,
            reason: 'v1 opencode.json with invented schema',
          })
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  return findings
}
