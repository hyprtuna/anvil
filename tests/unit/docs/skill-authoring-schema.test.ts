/**
 * ANV-0018 — Schema-alignment tests for docs/skill-authoring.md.
 *
 * Asserts that the documented SkillFrontmatter field names match what is
 * declared in src/core/types.ts. Prevents docs from drifting when the
 * schema is updated.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SkillFrontmatter } from '../../../src/core/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, '../../..')
const SKILL_DOC = readFileSync(
  resolve(ROOT, 'docs/skill-authoring.md'),
  'utf-8',
)

/** Walk Zod schema chain to find the innermost ZodObject and return its shape keys. */
function extractObjectKeys(schema: unknown): string[] {
  // biome-ignore lint/suspicious/noExplicitAny: Zod internal _def chain requires any traversal
  let s: any = schema
  const seen = new WeakSet()
  while (s && typeof s === 'object') {
    if (seen.has(s)) break
    seen.add(s)
    const typeName = s._def?.typeName
    if (typeName === 'ZodObject') {
      return Object.keys(s._def.shape())
    }
    // Traverse wrapper layers (ZodEffects = .transform() / .refine(), ZodBranded, etc.)
    if (s._def?.schema) {
      s = s._def.schema
      continue
    }
    if (s._def?.innerType) {
      s = s._def.innerType
      continue
    }
    break
  }
  return []
}

// ---------------------------------------------------------------------------
// Schema values
// ---------------------------------------------------------------------------

// SkillFrontmatter goes through .transform().refine() — walk to the inner object
const SCHEMA_FIELDS: string[] = extractObjectKeys(SkillFrontmatter)

// ---------------------------------------------------------------------------
// Field presence tests
// ---------------------------------------------------------------------------

describe('docs/skill-authoring.md — SkillFrontmatter fields', () => {
  it('schema walker extracts a non-empty SkillFrontmatter field list', () => {
    // A count of zero indicates the walker broke; the schema has many fields.
    expect(SCHEMA_FIELDS.length).toBeGreaterThan(0)
  })

  it('documents all required SkillFrontmatter fields', () => {
    // Fields that appear in the field-reference table
    // ANV-0214 (v0.17): preferred_model and preferred_effort were removed from
    // SkillFrontmatter. They no longer appear in the generated table.
    const requiredFields = ['name', 'kind', 'group', 'description']
    for (const field of requiredFields) {
      expect(SKILL_DOC, `required field '${field}' not documented`).toContain(
        `\`${field}\``,
      )
    }
  })

  it('documents all schema field names in the generated section', () => {
    // All SkillFrontmatter field names should appear at least once in the doc.
    // Kebab-case fields are stored as-is in the schema shape.
    for (const field of SCHEMA_FIELDS) {
      expect(SKILL_DOC, `field '${field}' not documented`).toContain(field)
    }
  })

  it('does not reference missing template file skills/universal/planner.md', () => {
    expect(SKILL_DOC).not.toContain('planner.md')
  })

  it('references existing canonical example skills/universal/code-review.md', () => {
    expect(SKILL_DOC).toContain('code-review')
  })
})

// ---------------------------------------------------------------------------
// Composition fields
// ---------------------------------------------------------------------------

describe('docs/skill-authoring.md — composition semantics', () => {
  it('documents sub_skills and chains as mutually exclusive', () => {
    expect(SKILL_DOC).toContain('sub_skills')
    expect(SKILL_DOC).toContain('chains')
    expect(SKILL_DOC).toContain('Mutually exclusive')
  })

  it('documents user-invocable default and new-skill rule', () => {
    expect(SKILL_DOC).toContain('user-invocable')
    expect(SKILL_DOC).toContain('false')
  })

  it('documents paths: field for path-scoped injection', () => {
    expect(SKILL_DOC).toContain('paths')
  })
})

// ---------------------------------------------------------------------------
// New content (ANV-0018 additions)
// ---------------------------------------------------------------------------

describe('docs/skill-authoring.md — required sections', () => {
  it('documents description budget (1536 / 8K)', () => {
    expect(SKILL_DOC).toContain('1 536')
    expect(SKILL_DOC).toContain('8 K')
  })

  it('documents ${CLAUDE_SKILL_DIR} substitution', () => {
    expect(SKILL_DOC).toContain('CLAUDE_SKILL_DIR')
  })

  it('documents description-as-trigger doctrine', () => {
    expect(SKILL_DOC).toContain('trigger')
    // Doctrine section should mention leading with scenario
    expect(SKILL_DOC).toContain('scenario')
  })

  it('documents voice-profile guidance', () => {
    expect(SKILL_DOC).toContain('voice')
    expect(SKILL_DOC).toContain('Directive')
    expect(SKILL_DOC).toContain('Collaborative')
  })

  it('documents model alias table (cheap/balanced/best)', () => {
    expect(SKILL_DOC).toContain('cheap')
    expect(SKILL_DOC).toContain('balanced')
    expect(SKILL_DOC).toContain('best')
  })
})
