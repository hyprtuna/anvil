import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RENAMES } from '../naming/rename-map.js'
import { slugFromPath, walkMd } from '../naming/walk.js'

function frontmatterName(path: string): string {
  const lines = readFileSync(path, 'utf-8').split('\n')
  let inFm = false
  for (const l of lines) {
    if (l === '---') {
      if (inFm) break
      inFm = true
      continue
    }
    if (inFm && l.startsWith('name:')) return l.slice(5).trim()
  }
  throw new Error(`no name: in frontmatter of ${path}`)
}

/**
 * Plan 40 Phase D — body callout coverage.
 *
 * Every renamed skill (70) AND every language skill MUST contain the
 *   "Invoke via `Skill({skill: "anvil:<slug>"})`" callout.
 *
 * Every agent MUST contain the inverse
 *   "Invoke via `Agent({subagent_type: "anvil:<slug>"})`" callout.
 */

describe('skills — invocation callout (Plan 40 Phase D)', () => {
  for (const r of RENAMES) {
    it(`${r.newSlug} body has Skill callout`, () => {
      const body = readFileSync(r.newPath, 'utf-8')
      expect(body).toContain(
        `Invoke via \`Skill({skill: "anvil:${r.newSlug}"})\``,
      )
    })
  }

  // Every language skill (Group D covers all 26 in v0.10.3, but guard against drift).
  const langSkills = walkMd('skills/languages')
  it('language-skill set includes >=20 files', () => {
    expect(langSkills.length).toBeGreaterThanOrEqual(20)
  })
  for (const path of langSkills) {
    const fileSlug = slugFromPath(path)
    it(`languages/${fileSlug} has Skill callout`, () => {
      const body = readFileSync(path, 'utf-8')
      const slug = frontmatterName(path)
      expect(body).toContain(`Invoke via \`Skill({skill: "anvil:${slug}"})\``)
    })
  }
})

describe('agents — invocation callout (Plan 40 Phase D)', () => {
  const agentFiles = walkMd('agents')
  // ANV-0083 collapsed 4 single-use review/audit agents (assumptions-surfacer,
  // comment-analyzer, type-design-analyzer, retroactive-validator) into
  // sibling Task(general-purpose) prompt bodies.  Floor lowered to >=18.
  it('agent set includes >=18 files', () => {
    expect(agentFiles.length).toBeGreaterThanOrEqual(18)
  })
  for (const path of agentFiles) {
    const slug = slugFromPath(path)
    it(`${slug} body has Agent callout`, () => {
      const body = readFileSync(path, 'utf-8')
      expect(body).toContain(
        `Invoke via \`Agent({subagent_type: "anvil:${slug}"})\``,
      )
    })
  }
})
