/**
 * ANV-0037 — Doctor row: "Skill MCP providers".
 *
 * Scans all loaded skills for `mcp_servers` declarations and validates that
 * each declared command resolves on PATH (or that transport refs declare a
 * url). Aggregated to a single row.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { validateAvailability } from '../../../skills/mcp-providers/index.js'

interface Row {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
}

function resolveSkillsRoot(cwd: string): string | null {
  const cwdSkills = join(cwd, 'skills')
  if (existsSync(cwdSkills)) return cwdSkills
  return null
}

/**
 * Push the Skill MCP providers row onto the doctor check list. Pure I/O at
 * the boundary (skill load + PATH probe) — no side effects beyond pushing
 * to `rows`.
 */
export async function pushSkillMcpProvidersCheck(
  rows: Row[],
  cwd: string,
): Promise<void> {
  const skillsRoot = resolveSkillsRoot(cwd)
  if (!skillsRoot) {
    rows.push({
      name: 'Skill MCP providers',
      status: 'skip',
      detail: 'no skills/ directory found',
      expectedAbsence: true,
    })
    return
  }
  const skills: Array<{
    name: string
    mcpServers: NonNullable<
      import('../../../core/types.js').SkillFrontmatter['mcp_servers']
    >
  }> = []
  try {
    const { loadAllSkills } = await import('../../../skills/load-all.js')
    const reg = await loadAllSkills({ skillsRoot })
    for (const s of reg.getAll()) {
      const refs = s.frontmatter.mcp_servers
      if (refs && refs.length > 0) {
        skills.push({ name: s.frontmatter.name, mcpServers: refs })
      }
    }
  } catch (err) {
    rows.push({
      name: 'Skill MCP providers',
      status: 'fail',
      detail: `failed to load skills: ${(err as Error).message}`,
    })
    return
  }
  if (skills.length === 0) {
    rows.push({
      name: 'Skill MCP providers',
      status: 'skip',
      detail: 'no skills declare mcp_servers',
      expectedAbsence: true,
    })
    return
  }
  let totalWarn = 0
  let totalFail = 0
  let totalRefs = 0
  const warnSkills: string[] = []
  for (const sk of skills) {
    const report = await validateAvailability(sk.mcpServers)
    totalRefs += report.results.length
    for (const r of report.results) {
      if (r.status === 'warn') totalWarn++
      if (r.status === 'fail') totalFail++
    }
    if (report.overall !== 'pass') warnSkills.push(sk.name)
  }
  const status: 'pass' | 'warn' | 'fail' =
    totalFail > 0 ? 'fail' : totalWarn > 0 ? 'warn' : 'pass'
  const detail =
    status === 'pass'
      ? `${skills.length} skill(s) declare MCP, ${totalRefs} refs all available`
      : `${warnSkills.length}/${skills.length} skill(s) with availability issues: ${warnSkills.join(', ')}`
  rows.push({ name: 'Skill MCP providers', status, detail })
}
