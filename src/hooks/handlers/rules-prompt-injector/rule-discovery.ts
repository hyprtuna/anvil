/**
 * Rule meta-skill discovery for rules-prompt-injector (Plan 43 Phase F).
 *
 * Resolution order (project → user → bundled):
 *   1. `<cwd>/.claude/skills/universal/rules/`
 *   2. `<HOME>/.claude/skills/universal/rules/`
 *   3. bundled `skills/universal/rules/` relative to this module (dev + dist)
 *
 * Returns metadata for every `.md` file with a parseable `name:` frontmatter
 * field, sorted by filename.
 */

import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface RuleSkill {
  name: string
  path: string
}

function candidateRuleDirs(cwd: string, home: string | undefined): string[] {
  // Helper module sits one level deeper than the original handler, so add an
  // extra `..` for both bundled candidates.
  const bundledCandidates = [
    join(__dirname, '..', '..', '..', '..', 'skills', 'universal', 'rules'),
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'skills',
      'universal',
      'rules',
    ),
  ]
  return [
    join(cwd, '.claude', 'skills', 'universal', 'rules'),
    ...(home ? [join(home, '.claude', 'skills', 'universal', 'rules')] : []),
    ...bundledCandidates,
  ]
}

async function parseFrontmatter(
  path: string,
): Promise<{ name?: string } | null> {
  try {
    const raw = await readFile(path, 'utf-8')
    if (!raw.startsWith('---\n')) return null
    const end = raw.indexOf('\n---\n', 4)
    if (end === -1) return null
    const fm = raw.slice(4, end)
    const nameMatch = fm.match(/^name:\s*(.+?)\s*$/m)
    return { name: nameMatch ? nameMatch[1].trim() : undefined }
  } catch {
    return null
  }
}

export async function loadRuleSkills(
  cwd: string,
  home: string | undefined,
): Promise<RuleSkill[]> {
  for (const dir of candidateRuleDirs(cwd, home)) {
    if (!existsSync(dir)) continue
    const entries = await readdir(dir, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => join(dir, e.name))
    const out: RuleSkill[] = []
    for (const path of files.sort()) {
      const fm = await parseFrontmatter(path)
      if (!fm?.name) continue
      out.push({ name: fm.name, path })
    }
    return out
  }
  return []
}
