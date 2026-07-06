import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { INTENT_DEFINITIONS } from '../../src/intent/intents.js'
import { loadAllSkills } from '../../src/skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT = join(__dirname, '..', '..', 'skills')

/**
 * Every skill name in an intent's `defaultSkills` must resolve to a file
 * in `skills/universal/` or `skills/languages/`. Catches renames or
 * deletions that would silently break automatic routing (the router
 * filters against installed skills at runtime but would leave the user
 * with an empty skill bundle, so catch at CI time).
 */
describe('integration: every intent skill exists', () => {
  it('every defaultSkill in INTENT_DEFINITIONS resolves to a loaded skill', async () => {
    const skills = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const installed = new Set(skills.getAll().map((s) => s.frontmatter.name))

    const missing: Array<{ intent: string; skill: string }> = []
    for (const def of Object.values(INTENT_DEFINITIONS)) {
      for (const skill of def.defaultSkills) {
        if (!installed.has(skill)) {
          missing.push({ intent: def.name, skill })
        }
      }
    }

    expect(
      missing,
      `intents reference skills that are not installed:\n${missing
        .map((m) => `  - ${m.intent} → ${m.skill}`)
        .join('\n')}`,
    ).toEqual([])
  })
})
