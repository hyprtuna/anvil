/**
 * Integration test: semantic fallback routes vague-but-meaningful prompts
 * to a non-main skill (Plan 31 G4).
 *
 * These prompts are intentionally distinct from the A7 corpus (33-prompt set).
 * Each prompt is semantically suggestive of a skill but lacks the direct
 * keywords that the primary keyword-based router matches.
 *
 * The test verifies that when `skillObjects` are supplied to `route()`, vague
 * prompts still get routed somewhere useful (not left on `main` fallback).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { route } from '../../src/intent/router.js'
import { loadAllSkills } from '../../src/skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const SKILLS_ROOT = join(REPO_ROOT, 'skills')

/**
 * Vague but semantically meaningful prompts — NOT in the A7 corpus.
 * Each should route to a non-main skill via the Jaccard semantic fallback.
 */
const VAGUE_PROMPTS = [
  'this is messy, can you do something about it',
  'I want better tests',
  'rewrite this part',
  'make this prettier',
  'find the issue',
]

describe('integration: semantic-fallback — vague prompts route to non-main skill', () => {
  it('each vague prompt routes to a non-main skill when skillObjects are supplied', async () => {
    const skills = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const skillList = skills.getAll()
    const availableSkills = new Set(skillList.map((s) => s.frontmatter.name))
    // Use an empty agent set so the router does not filter agents (defaultAgent is used as-is)
    const availableAgents = new Set<string>()

    const results = VAGUE_PROMPTS.map((prompt) => {
      const decision = route(prompt, {
        availableSkills,
        availableAgents,
        skillObjects: skillList,
      })
      return {
        prompt,
        fallback: decision.fallback,
        skills: decision.skills,
        confidence: decision.confidence,
      }
    })

    // Each prompt must have at least one skill resolved and must NOT have
    // fallback === 'main' (which would mean the router had no signal at all).
    const unrouted = results.filter(
      (r) => r.fallback === 'main' && r.skills.length === 0,
    )

    if (unrouted.length > 0) {
      const details = unrouted.map((r) => `  - "${r.prompt}"`).join('\n')
      throw new Error(
        `${unrouted.length}/${VAGUE_PROMPTS.length} vague prompts were left on main with no skills:\n${details}\n\nThis means the semantic fallback did not fire. Check that skillObjects are being passed through correctly.`,
      )
    }

    // Each routed prompt should have at least one skill
    for (const result of results) {
      expect(
        result.skills.length,
        `"${result.prompt}" — expected at least 1 skill`,
      ).toBeGreaterThan(0)
    }
  })
})
