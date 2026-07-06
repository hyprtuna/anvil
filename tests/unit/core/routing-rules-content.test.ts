/**
 * ANV-0017 (P0, W-004) — routing-rules content is generated from a structured
 * table; every referenced slug must exist on disk under `skills/` or
 * `agents/`, and the table must agree with `INTENT_DEFINITIONS` in
 * `src/intent/intents.ts` for shared intents.
 *
 * Guards against the original W-004 bug where the prose hallucinated a
 * `code-reviewer` skill (it is an agent slug — the skill is `code-review`).
 */

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ANVIL_OC_ROUTING_CONTENT,
  ANVIL_ROUTING_RULES_CONTENT,
  ROUTING_INTENT_TABLE,
  extractReferencedSlugs,
  findUnknownSlugs,
} from '../../../src/core/routing-rules-content.js'
import { INTENT_DEFINITIONS } from '../../../src/intent/intents.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const SKILLS_ROOT = join(REPO_ROOT, 'skills')
const AGENTS_ROOT = join(REPO_ROOT, 'agents')

/**
 * Walk `skills/` recursively and return every slug — derived from the
 * filename (stem of `*.md`) and the directory name when a `SKILL.md`
 * pattern is used (e.g. `skills/using-anvil/SKILL.md` → `using-anvil`).
 */
function loadSkillSlugsFromDisk(): Set<string> {
  const slugs = new Set<string>()
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        visit(join(dir, entry.name))
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      if (
        entry.name === 'CLAUDE.md' ||
        entry.name === 'AGENTS.md' ||
        entry.name === 'README.md'
      ) {
        continue
      }
      if (entry.name === 'SKILL.md') {
        slugs.add(dir.split('/').pop() ?? '')
        continue
      }
      slugs.add(entry.name.replace(/\.md$/, ''))
    }
  }
  visit(SKILLS_ROOT)
  return slugs
}

function loadAgentSlugsFromDisk(): Set<string> {
  const slugs = new Set<string>()
  for (const entry of readdirSync(AGENTS_ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    if (entry.name === 'CLAUDE.md' || entry.name === 'AGENTS.md') continue
    slugs.add(entry.name.replace(/\.md$/, ''))
  }
  return slugs
}

describe('routing-rules-content — slug existence', () => {
  const skillSlugs = loadSkillSlugsFromDisk()
  const agentSlugs = loadAgentSlugsFromDisk()

  it('every agent slug in ROUTING_INTENT_TABLE exists under agents/', () => {
    for (const entry of ROUTING_INTENT_TABLE) {
      expect(
        agentSlugs.has(entry.agent),
        `intent "${entry.intent}" agent "${entry.agent}" missing from agents/`,
      ).toBe(true)
    }
  })

  it('every skill slug in ROUTING_INTENT_TABLE exists under skills/', () => {
    for (const entry of ROUTING_INTENT_TABLE) {
      for (const skill of entry.skills) {
        expect(
          skillSlugs.has(skill),
          `intent "${entry.intent}" skill "${skill}" missing from skills/`,
        ).toBe(true)
      }
    }
  })

  it('CC routing prose references no unknown slugs', () => {
    const unknown = findUnknownSlugs(
      ANVIL_ROUTING_RULES_CONTENT,
      skillSlugs,
      agentSlugs,
    )
    // The generated prose contains some non-slug backticked tokens
    // (`/skill`, `@agent`) which the extractor will skip because of the
    // leading punctuation. Anything left must resolve.
    expect(unknown).toEqual([])
  })

  it('OC routing prose references no unknown slugs', () => {
    const unknown = findUnknownSlugs(
      ANVIL_OC_ROUTING_CONTENT,
      skillSlugs,
      agentSlugs,
    )
    expect(unknown).toEqual([])
  })

  it('review routing points to code-review skill (not code-reviewer skill)', () => {
    const review = ROUTING_INTENT_TABLE.find((e) => e.intent === 'review')
    expect(review).toBeDefined()
    expect(review?.agent).toBe('code-reviewer')
    expect(review?.skills).toContain('code-review')
    expect(review?.skills).not.toContain('code-reviewer')
  })
})

describe('routing-rules-content — intent metadata cross-check', () => {
  it('each ROUTING_INTENT_TABLE entry agrees with INTENT_DEFINITIONS', () => {
    for (const entry of ROUTING_INTENT_TABLE) {
      const def =
        INTENT_DEFINITIONS[entry.intent as keyof typeof INTENT_DEFINITIONS]
      expect(
        def,
        `intent "${entry.intent}" missing from INTENT_DEFINITIONS`,
      ).toBeDefined()
      if (!def) continue
      expect(
        entry.agent,
        `intent "${entry.intent}" agent disagrees with INTENT_DEFINITIONS.defaultAgent`,
      ).toBe(def.defaultAgent)
      // Routing prose may reference a subset/superset of defaultSkills
      // depending on user-facing emphasis. We require every prose skill to
      // appear in defaultSkills (no fabricated skills) — the reverse is OK.
      for (const skill of entry.skills) {
        expect(
          def.defaultSkills,
          `intent "${entry.intent}" skill "${skill}" not in INTENT_DEFINITIONS.defaultSkills`,
        ).toContain(skill)
      }
    }
  })
})

describe('extractReferencedSlugs / findUnknownSlugs', () => {
  it('extractReferencedSlugs picks up backtick-quoted slug-shaped tokens', () => {
    const out = extractReferencedSlugs('use `code-review` and `code-reviewer`')
    expect(out).toContain('code-review')
    expect(out).toContain('code-reviewer')
  })

  it('extractReferencedSlugs ignores tokens with leading punctuation', () => {
    // `/skill` and `@agent` are documentation tokens, not slug references.
    const out = extractReferencedSlugs('use `/skill` or `@agent`')
    expect(out).not.toContain('skill')
    expect(out).not.toContain('agent')
  })

  it('findUnknownSlugs flags a fabricated slug like code-reviewer-pro', () => {
    const fabricated = 'try the `code-reviewer-pro` agent + `code-review` skill'
    const skills = new Set(['code-review'])
    const agents = new Set(['code-reviewer'])
    const unknown = findUnknownSlugs(fabricated, skills, agents)
    expect(unknown).toContain('code-reviewer-pro')
    expect(unknown).not.toContain('code-review')
  })

  it('findUnknownSlugs returns an empty list when all slugs are known', () => {
    const ok = 'use `code-reviewer` agent + `code-review` skill'
    const skills = new Set(['code-review'])
    const agents = new Set(['code-reviewer'])
    expect(findUnknownSlugs(ok, skills, agents)).toEqual([])
  })
})
