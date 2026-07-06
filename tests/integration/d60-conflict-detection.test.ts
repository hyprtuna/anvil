/**
 * ANV-0211 — D-60 Conflict Detection (build-failing)
 *
 * D-60 policy (ANV-0251): defaults.ts is the resolver's source of truth.
 * Every skill's frontmatter `preferred_model` / `preferred_effort` MUST agree
 * with what `resolveModel()` actually produces for that skill name.
 *
 * This test FAILS the build when frontmatter disagrees with the resolver.
 * The human must resolve disagreements by either:
 *   (a) Adding the skill name to the correct group in defaults.ts (preferred), OR
 *   (b) Updating the frontmatter to match what the resolver produces.
 *
 * Why this matters: ANV-0212 will migrate 10 src consumers to read from
 * the registry. If frontmatter and defaults.ts disagree, consumers get
 * inconsistent data. This test prevents silent drift going forward.
 */

import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { resolveAlias } from '../../src/core/models/aliases.js'
import { resolveModel } from '../../src/core/models/resolve.js'
import {
  BUNDLED_SKILL_REGISTRY,
  resolveSkillAssignment,
} from '../../src/core/registry/skill-model-registry.js'

const config = buildDefaultConfig()

describe('D-60 registry-vs-defaults groups-table consistency', () => {
  it('every BUNDLED_SKILL_REGISTRY entry that has a group assignment matches the same skill in defaults.ts groups.members[]', () => {
    // Build an inverse map: skill name → { groupName, model, effort } from defaults.ts groups
    const skillToGroup = new Map<
      string,
      { name: string; model: string; effort: string }
    >()
    for (const [groupName, groupDef] of Object.entries(config.groups ?? {})) {
      for (const member of groupDef.members ?? []) {
        skillToGroup.set(member, {
          name: groupName,
          model: groupDef.model,
          effort: groupDef.effort ?? '',
        })
      }
    }

    // For every registry entry that IS in a group, model/effort must agree with the group.
    // (Overrides take precedence over groups — skip members that also appear in overrides.)
    const drifts: string[] = []
    for (const [skillName, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      const groupInfo = skillToGroup.get(skillName)
      if (!groupInfo) continue // not in any group — intentional per-skill entry or override-only
      const hasOverride =
        config.overrides &&
        skillName in (config.overrides as Record<string, unknown>)
      if (hasOverride) continue // override supersedes group; intentional

      const resolvedGroupModel = resolveAlias(
        groupInfo.model,
        config.model_aliases,
      )
      const resolvedEntryModel = resolveAlias(
        entry.model ?? '',
        config.model_aliases,
      )

      if (entry.model && resolvedEntryModel !== resolvedGroupModel) {
        drifts.push(
          `  ${skillName}: registry model="${entry.model}" (→${resolvedEntryModel}) disagrees with group "${groupInfo.name}" model="${groupInfo.model}" (→${resolvedGroupModel})`,
        )
      }
      if (
        entry.effort &&
        groupInfo.effort &&
        entry.effort !== groupInfo.effort
      ) {
        drifts.push(
          `  ${skillName}: registry effort="${entry.effort}" disagrees with group "${groupInfo.name}" effort="${groupInfo.effort}"`,
        )
      }
    }

    // Every registry entry that IS in a group must agree with that group's model/effort.
    // Registry entries not in any group are intentional (per-skill or override-only) — not a failure.
    if (drifts.length > 0) {
      throw new Error(
        `D-60 REGISTRY-VS-DEFAULTS DRIFT: ${drifts.length} BUNDLED_SKILL_REGISTRY entries disagree with their defaults.ts group assignment.\n\nTo fix: update the registry entry model/effort to match the group definition (or add the skill to the correct group).\n\n${drifts.join('\n')}`,
      )
    }

    // Sanity: the registry must have a meaningful number of entries
    expect(Object.keys(BUNDLED_SKILL_REGISTRY).length).toBeGreaterThan(20)
    expect(drifts).toHaveLength(0)
  })

  it('every BUNDLED_SKILL_REGISTRY entry is reachable via resolveSkillAssignment', () => {
    // Sanity: registry round-trip — resolveSkillAssignment must return the same entry
    const mismatches: string[] = []
    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      const resolved = resolveSkillAssignment(name)
      if (!resolved) {
        mismatches.push(`  ${name}: resolveSkillAssignment returned undefined`)
        continue
      }
      if (resolved.model !== entry.model) {
        mismatches.push(
          `  ${name}: resolveSkillAssignment model="${resolved.model}" vs registry model="${entry.model}"`,
        )
      }
    }
    if (mismatches.length > 0) {
      throw new Error(
        `D-60 ROUND-TRIP FAILURE: ${mismatches.length} registry entries not reachable via resolveSkillAssignment.\n\n${mismatches.join('\n')}`,
      )
    }
    expect(mismatches).toHaveLength(0)
  })
})

describe('D-60 coverage — BUNDLED_SKILL_REGISTRY vs resolver', () => {
  it('every BUNDLED_SKILL_REGISTRY entry model matches resolver output', () => {
    const mismatches: string[] = []

    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      if (!entry.model) continue
      const resolved = resolveModel(name, config, {})
      const registryModel = resolveAlias(entry.model, config.model_aliases)
      if (registryModel !== resolved.model) {
        mismatches.push(
          `  ${name}: registry="${entry.model}" (→${registryModel}) vs resolver="${resolved.model}" (source=${resolved.source})`,
        )
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `D-60 REGISTRY MISMATCH: ${mismatches.length} BUNDLED_SKILL_REGISTRY entries do not match resolver output.\nUpdate the registry entries to match what resolveModel() produces.\n\n${mismatches.join('\n')}`,
      )
    }
  })

  it('every BUNDLED_SKILL_REGISTRY entry effort matches resolver output', () => {
    const mismatches: string[] = []

    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      if (!entry.effort) continue
      const resolved = resolveModel(name, config, {})
      if (entry.effort !== resolved.effort) {
        mismatches.push(
          `  ${name}: registry="${entry.effort}" vs resolver="${resolved.effort}" (source=${resolved.source})`,
        )
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `D-60 REGISTRY EFFORT MISMATCH: ${mismatches.length} BUNDLED_SKILL_REGISTRY entries have wrong effort.\nUpdate the registry entries to match what resolveModel() produces.\n\n${mismatches.join('\n')}`,
      )
    }
  })
})
