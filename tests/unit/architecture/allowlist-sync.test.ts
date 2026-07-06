import { describe, expect, it } from 'vitest'
import {
  ROOT_CORE_ALLOWLIST,
  ROOT_DEPRECATED_ALLOWLIST,
} from '../../../src/commands/cli/doctor-checks/frontmatter-portability.js'
import {
  AgentFrontmatterBase,
  SkillFrontmatter,
} from '../../../src/core/types.js'

// ─── Schema key extraction ────────────────────────────────────────────────────

/**
 * Recursively unwrap ZodEffects chains to reach the inner ZodObject's shape.
 * SkillFrontmatter uses .transform() which wraps the ZodObject in ZodEffects;
 * AgentFrontmatterBase is a plain ZodObject (with .strict()).
 */
function extractShape(schema: unknown): Record<string, unknown> | null {
  const s = schema as Record<string, unknown>
  const def = s._def as Record<string, unknown> | undefined
  if (!def) return null
  if (def.typeName === 'ZodObject') {
    return s.shape as Record<string, unknown>
  }
  if (def.schema) return extractShape(def.schema)
  if (def.innerType) return extractShape(def.innerType)
  return null
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ROOT_DEPRECATED_ALLOWLIST schema sync', () => {
  it('schema keys minus ROOT_CORE_ALLOWLIST equal ROOT_DEPRECATED_ALLOWLIST', () => {
    // 1. Collect all keys from the union of both schemas
    const agentShape = extractShape(AgentFrontmatterBase)
    expect(
      agentShape,
      'AgentFrontmatterBase must expose a .shape — check ZodObject detection',
    ).not.toBeNull()

    const skillShape = extractShape(SkillFrontmatter)
    expect(
      skillShape,
      'SkillFrontmatter must expose a .shape — check ZodEffects unwrap logic',
    ).not.toBeNull()

    const allSchemaKeys = new Set([
      ...Object.keys(agentShape!),
      ...Object.keys(skillShape!),
    ])

    // 2. Subtract keys already covered by ROOT_CORE_ALLOWLIST
    const schemaMinusCore = new Set(
      [...allSchemaKeys].filter((k) => !ROOT_CORE_ALLOWLIST.has(k)),
    )

    // 3a. Keys in schema-minus-core that are NOT in ROOT_DEPRECATED_ALLOWLIST
    //     → schema drift: a new field was added without being classified
    const inSchemaNotDeprecated = [...schemaMinusCore].filter(
      (k) => !ROOT_DEPRECATED_ALLOWLIST.has(k),
    )

    // 3b. Keys in ROOT_DEPRECATED_ALLOWLIST that are NOT in schema-minus-core
    //     → stale entry: the schema no longer declares this field
    const inDeprecatedNotSchema = [...ROOT_DEPRECATED_ALLOWLIST].filter(
      (k) => !schemaMinusCore.has(k),
    )

    expect(
      inSchemaNotDeprecated,
      [
        'Schema fields exist that are in neither ROOT_CORE_ALLOWLIST nor ROOT_DEPRECATED_ALLOWLIST.',
        'The frontmatter-portability doctor check would classify them as unknown-root-key failures.',
        'Add each field to ROOT_CORE_ALLOWLIST (if CC/OC-native) or ROOT_DEPRECATED_ALLOWLIST (if Anvil-only).',
      ].join(' '),
    ).toEqual([])

    expect(
      inDeprecatedNotSchema,
      [
        'ROOT_DEPRECATED_ALLOWLIST contains keys that no longer exist in either schema.',
        'These are stale entries. Remove them from ROOT_DEPRECATED_ALLOWLIST.',
      ].join(' '),
    ).toEqual([])
  })
})
