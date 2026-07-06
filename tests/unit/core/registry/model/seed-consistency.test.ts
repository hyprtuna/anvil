/**
 * ANV-0211 — Seed Consistency Test (revised)
 *
 * Replaces the tautological original test that only compared registry-to-resolver
 * (both were hand-curated to match, so it could never fail).
 *
 * New assertions:
 *   1. Every skill file with `preferred_model` frontmatter has a corresponding
 *      entry in BUNDLED_SKILL_REGISTRY.
 *   2. Every registry entry's model/effort matches resolveModel() output (preserved).
 *   3. Every skill in defaults.ts groups.<g>.members[] is in the registry.
 *   4. security-auditing is in BUNDLED_SKILL_REGISTRY (not BUNDLED_AGENT_REGISTRY).
 *
 * The full D-60 conflict detection test lives in:
 *   tests/integration/d60-conflict-detection.test.ts
 * That test reads actual skill files from disk; this test is a fast unit-level
 * check that only uses in-memory structures.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../../src/core/config/defaults.js'
import { resolveAlias } from '../../../../../src/core/models/aliases.js'
import { resolveModel } from '../../../../../src/core/models/resolve.js'
import {
  BUNDLED_AGENT_REGISTRY,
  BUNDLED_SKILL_REGISTRY,
} from '../../../../../src/core/registry/model-registry-index.js'

const config = buildDefaultConfig()

/** Recursively collect all .md files under a directory, excluding rules/ subdirs and AGENTS/CLAUDE.md. */
function collectSkillFiles(dir: string): string[] {
  const results: string[] = []
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'rules') continue
      results.push(...collectSkillFiles(fullPath))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      entry.name !== 'AGENTS.md' &&
      entry.name !== 'CLAUDE.md'
    ) {
      results.push(fullPath)
    }
  }
  return results
}

function parseFrontmatterName(content: string): string | undefined {
  const match = /^---\n([\s\S]*?)\n---/.exec(content)
  if (!match) return undefined
  const nameLine = match[1].split('\n').find((l) => /^name:\s/.test(l.trim()))
  return nameLine ? nameLine.replace(/^name:\s+/, '').trim() : undefined
}

function frontmatterHasPreferredModel(content: string): boolean {
  const match = /^---\n([\s\S]*?)\n---/.exec(content)
  if (!match) return false
  return match[1].split('\n').some((l) => /^preferred_model:\s/.test(l.trim()))
}

/**
 * Resolve what model and effort defaults.ts would assign to a given name
 * using the existing resolver (no CLI/env overrides).
 */
function resolveFromDefaults(name: string): {
  model: string
  effort: string | undefined
} {
  const result = resolveModel(name, config, {})
  return { model: result.model, effort: result.effort }
}

describe('BUNDLED_SKILL_REGISTRY — every skill with preferred_model is registered', () => {
  it('every skill file with preferred_model has an entry in BUNDLED_SKILL_REGISTRY', () => {
    const skillFiles = collectSkillFiles('skills')
    const missing: string[] = []
    for (const file of skillFiles) {
      const content = readFileSync(file, 'utf-8')
      if (!frontmatterHasPreferredModel(content)) continue
      const name = parseFrontmatterName(content)
      if (!name) continue
      if (!BUNDLED_SKILL_REGISTRY[name]) {
        missing.push(`  ${name} [${file}]`)
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `${missing.length} skill(s) have preferred_model in frontmatter but are missing from BUNDLED_SKILL_REGISTRY:\n${missing.join('\n')}`,
      )
    }
  })
})

describe('BUNDLED_SKILL_REGISTRY — every group member is registered', () => {
  it('every skill listed in defaults.ts groups members is in BUNDLED_SKILL_REGISTRY', () => {
    const groups = config.groups ?? {}
    const missing: string[] = []
    // Skip agent-only group members (agents live in BUNDLED_AGENT_REGISTRY)
    const agentNames = new Set(Object.keys(config.agents ?? {}))
    for (const [groupName, groupConfig] of Object.entries(groups)) {
      for (const member of groupConfig.members ?? []) {
        if (agentNames.has(member)) continue // agent members belong in agent registry
        if (!BUNDLED_SKILL_REGISTRY[member]) {
          missing.push(`  ${member} (group: ${groupName})`)
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `${missing.length} skills in defaults.ts group members are missing from BUNDLED_SKILL_REGISTRY:\n${missing.join('\n')}`,
      )
    }
  })
})

describe('BUNDLED_SKILL_REGISTRY seed consistency', () => {
  it('every bundled skill entry has a role', () => {
    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      expect(entry.role, `${name} must have a role`).toBeDefined()
      expect(['small', 'coding', 'review', 'planning', 'autonomous']).toContain(
        entry.role,
      )
    }
  })

  it('bundled model values match what defaults.ts resolves (where model is pinned)', () => {
    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      if (!entry.model) continue
      const resolved = resolveFromDefaults(name)
      const registryModel = resolveAlias(entry.model, config.model_aliases)
      expect(
        registryModel,
        `${name}: registry model "${entry.model}" (→${registryModel}) must match resolver output "${resolved.model}"`,
      ).toBe(resolved.model)
    }
  })

  it('bundled effort values match what defaults.ts resolves (where effort is pinned)', () => {
    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      if (!entry.effort) continue
      const resolved = resolveFromDefaults(name)
      expect(
        entry.effort,
        `${name}: registry effort "${entry.effort}" must match resolver output "${resolved.effort}"`,
      ).toBe(resolved.effort)
    }
  })

  it('no skill appears in both skill and agent registries', () => {
    const agentNames = new Set(Object.keys(BUNDLED_AGENT_REGISTRY))
    for (const name of Object.keys(BUNDLED_SKILL_REGISTRY)) {
      expect(
        agentNames.has(name),
        `"${name}" must not appear in both skill and agent registries`,
      ).toBe(false)
    }
  })

  it('security-auditing is in BUNDLED_SKILL_REGISTRY (moved from agent registry)', () => {
    expect(
      BUNDLED_SKILL_REGISTRY['security-auditing'],
      'security-auditing is a skill (skills/universal/security-auditing.md), must be in skill registry',
    ).toBeDefined()
    expect(
      BUNDLED_AGENT_REGISTRY['security-auditing'],
      'security-auditing must NOT be in agent registry after ANV-0211 move',
    ).toBeUndefined()
  })
})

describe('BUNDLED_AGENT_REGISTRY seed consistency', () => {
  it('every bundled agent entry has a role', () => {
    for (const [name, entry] of Object.entries(BUNDLED_AGENT_REGISTRY)) {
      expect(entry.role, `${name} must have a role`).toBeDefined()
      expect(['small', 'coding', 'review', 'planning', 'autonomous']).toContain(
        entry.role,
      )
    }
  })

  it('agent model values match what defaults.ts resolves (where model is pinned)', () => {
    for (const [name, entry] of Object.entries(BUNDLED_AGENT_REGISTRY)) {
      if (!entry.model) continue
      const resolved = resolveFromDefaults(name)
      const registryModel = resolveAlias(entry.model, config.model_aliases)
      expect(
        registryModel,
        `${name}: registry model "${entry.model}" (→${registryModel}) must match resolver output "${resolved.model}"`,
      ).toBe(resolved.model)
    }
  })

  it('agent effort values match what defaults.ts resolves (where effort is pinned)', () => {
    for (const [name, entry] of Object.entries(BUNDLED_AGENT_REGISTRY)) {
      if (!entry.effort) continue
      const resolved = resolveFromDefaults(name)
      expect(
        entry.effort,
        `${name}: registry effort "${entry.effort}" must match resolver output "${resolved.effort}"`,
      ).toBe(resolved.effort)
    }
  })

  it('contains all agents from defaults.ts agents table (excluding security-auditing which is a skill)', () => {
    // security-auditing is listed in defaults.ts agents table as a pre-existing bug.
    // ANV-0211 moved it to BUNDLED_SKILL_REGISTRY. The agents table entry is NOT corrected
    // here (would change resolver behavior — deferred to ANV-0213/ANV-0214).
    const KNOWN_AGENT_MISCLASSIFICATIONS = new Set(['security-auditing'])
    const expectedAgents = Object.keys(config.agents ?? {}).filter(
      (a) => !KNOWN_AGENT_MISCLASSIFICATIONS.has(a),
    )
    for (const agent of expectedAgents) {
      expect(
        BUNDLED_AGENT_REGISTRY[agent],
        `Agent "${agent}" from defaults.ts must be in BUNDLED_AGENT_REGISTRY`,
      ).toBeDefined()
    }
  })
})
