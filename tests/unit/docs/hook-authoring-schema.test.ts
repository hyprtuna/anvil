/**
 * ANV-0010 — Schema-alignment tests for docs/hook-authoring.md.
 *
 * Asserts that the documented HookKind values, HookContext fields, and
 * HookResult fields match what is declared in src/core/types.ts. This
 * prevents the docs from drifting when the schema is updated.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { HookContext, HookKind, HookResult } from '../../../src/core/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, '../../..')
const HOOK_DOC = readFileSync(resolve(ROOT, 'docs/hook-authoring.md'), 'utf-8')

/** Extract enum values from a z.enum() schema. */
function enumValues(schema: {
  options?: string[]
  _def?: { values?: string[] }
}): string[] {
  if (schema.options && Array.isArray(schema.options)) return schema.options
  if (schema._def?.values && Array.isArray(schema._def.values))
    return schema._def.values
  return []
}

/** Extract shape keys from a z.object() schema, walking through transforms/refines. */
function objectKeys(schema: {
  shape?: Record<string, unknown>
  _def?: {
    shape?: () => Record<string, unknown>
    schema?: unknown
    innerType?: unknown
  }
}): string[] {
  // Direct shape
  if (schema.shape && typeof schema.shape === 'object')
    return Object.keys(schema.shape)
  const def = schema._def
  if (!def) return []
  // ZodObject
  if (typeof def.shape === 'function') return Object.keys(def.shape())
  // ZodTransform / ZodEffects wrapping an inner object
  if (def.schema)
    return objectKeys(def.schema as Parameters<typeof objectKeys>[0])
  if (def.innerType)
    return objectKeys(def.innerType as Parameters<typeof objectKeys>[0])
  return []
}

// ---------------------------------------------------------------------------
// Schema values
// ---------------------------------------------------------------------------

const SCHEMA_HOOK_KINDS: string[] = enumValues(
  HookKind as Parameters<typeof enumValues>[0],
)
const SCHEMA_CONTEXT_FIELDS: string[] = objectKeys(
  HookContext as Parameters<typeof objectKeys>[0],
)
const SCHEMA_RESULT_FIELDS: string[] = objectKeys(
  HookResult as Parameters<typeof objectKeys>[0],
)

// ---------------------------------------------------------------------------
// HookKind values
// ---------------------------------------------------------------------------

describe('docs/hook-authoring.md — HookKind coverage', () => {
  it('schema exports at least one HookKind value', () => {
    expect(SCHEMA_HOOK_KINDS.length).toBeGreaterThan(0)
  })

  it('doc references the first HookKind value from schema', () => {
    expect(HOOK_DOC).toContain(`\`${SCHEMA_HOOK_KINDS[0]}\``)
  })

  it('documents every HookKind value in the generated section', () => {
    for (const kind of SCHEMA_HOOK_KINDS) {
      expect(HOOK_DOC, `missing HookKind: ${kind}`).toContain(`\`${kind}\``)
    }
  })

  it('does not reference stale HookKind values removed from the schema', () => {
    // These were removed in a prior release (comment-checker, rules-injector, and 14 D1 stubs)
    const staleKinds = ['comment-checker', 'rules-injector']
    for (const stale of staleKinds) {
      // Only check code-span references, not text mentions in history sections
      const codeSpan = `\`${stale}\``
      expect(
        HOOK_DOC,
        `stale HookKind still referenced: ${stale}`,
      ).not.toContain(codeSpan)
    }
  })
})

// ---------------------------------------------------------------------------
// HookContext fields
// ---------------------------------------------------------------------------

describe('docs/hook-authoring.md — HookContext fields', () => {
  it('documents all schema HookContext fields', () => {
    for (const field of SCHEMA_CONTEXT_FIELDS) {
      expect(HOOK_DOC, `HookContext.${field} not documented`).toContain(field)
    }
  })

  it('does not mention stale HookContext fields', () => {
    const staleFields = ['skillName', 'prompt', 'filePath']
    for (const f of staleFields) {
      // ctx.skillName / ctx.prompt / ctx.filePath should not appear
      expect(
        HOOK_DOC,
        `stale HookContext field still referenced: ctx.${f}`,
      ).not.toContain(`ctx.${f}`)
    }
  })

  it('exposes the documented HookContext fields from schema', () => {
    // Structural: assert the documented fields are present without pinning a literal count.
    expect(SCHEMA_CONTEXT_FIELDS).toEqual(
      expect.arrayContaining(['kind', 'cwd', 'config', 'env', 'payload']),
    )
  })
})

// ---------------------------------------------------------------------------
// HookResult fields
// ---------------------------------------------------------------------------

describe('docs/hook-authoring.md — HookResult fields', () => {
  it('documents all schema HookResult fields', () => {
    for (const field of SCHEMA_RESULT_FIELDS) {
      expect(HOOK_DOC, `HookResult.${field} not documented`).toContain(field)
    }
  })

  it('does not mention stale HookResult field "output"', () => {
    // The old `output` field was renamed to `message` — doc must not use it as a field name
    // We check for ctx.output or `output:` patterns in code blocks
    // (plain prose mentioning "output" as a noun is fine)
    expect(HOOK_DOC).not.toContain('ctx.output')
    // The `output:` lint rule from ANV-0007 catches code-block usage; we mirror it here
    const codeBlockOutputField = /^\s*output\s*:/m
    expect(codeBlockOutputField.test(HOOK_DOC)).toBe(false)
  })

  it('documents exitCode values 0, 1, 2', () => {
    expect(HOOK_DOC).toContain('`0`')
    expect(HOOK_DOC).toContain('`1`')
    expect(HOOK_DOC).toContain('`2`')
  })

  it('documents both output channels (message and systemInsert)', () => {
    expect(HOOK_DOC).toContain('message')
    expect(HOOK_DOC).toContain('systemInsert')
  })
})

// ---------------------------------------------------------------------------
// Cross-walk to CC events
// ---------------------------------------------------------------------------

describe('docs/hook-authoring.md — CC cross-walk', () => {
  it('mentions the CC handler types', () => {
    // CC has 5 handler types; at minimum document "command" (the one Anvil uses)
    expect(HOOK_DOC).toContain('command')
  })

  it('documents the if: permission rule', () => {
    expect(HOOK_DOC).toContain('if:')
  })

  it('mentions hook profiles (minimal / standard / strict)', () => {
    expect(HOOK_DOC).toContain('minimal')
    expect(HOOK_DOC).toContain('standard')
    expect(HOOK_DOC).toContain('strict')
  })
})
