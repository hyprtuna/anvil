import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { ContentFixture, RoutingFixture, SkillFixtures } from './types.js'

export async function loadSkillFixtures(
  skillName: string,
  fixturesRoot: string,
): Promise<SkillFixtures> {
  const dir = join(fixturesRoot, skillName)
  if (!existsSync(dir)) return { routing: [], content: [] }

  const files = await readdir(dir)
  const routing: RoutingFixture[] = []
  const content: ContentFixture[] = []

  for (const file of files) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue
    const raw = await readFile(join(dir, file), 'utf-8')
    const parsed = matter(raw)
    const data = parsed.data as Record<string, unknown>
    const cases = data.cases as unknown[]

    if (file.startsWith('routing') && Array.isArray(cases)) {
      routing.push(...(cases as RoutingFixture[]))
    } else if (file.startsWith('content') && Array.isArray(cases)) {
      content.push(...(cases as ContentFixture[]))
    }
  }

  return { routing, content }
}
