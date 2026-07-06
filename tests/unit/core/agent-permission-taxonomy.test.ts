/**
 * ANV-0003 — Unit tests for the agent permission taxonomy schema in
 * src/core/types.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  AGENT_PERMISSION_TAXONOMY,
  AgentPermissionClass,
  AgentPermissionEntry,
  AgentPermissionTaxonomy,
  classifyAgentSuffix,
} from '../../../src/core/types.js'

describe('AGENT_PERMISSION_TAXONOMY', () => {
  it('passes the AgentPermissionTaxonomy Zod schema', () => {
    const result = AgentPermissionTaxonomy.safeParse(AGENT_PERMISSION_TAXONOMY)
    expect(result.success).toBe(true)
  })

  it('contains an entry for every AgentPermissionClass enum value', () => {
    for (const cls of AgentPermissionClass.options) {
      expect(AGENT_PERMISSION_TAXONOMY[cls]).toBeDefined()
    }
  })

  it('each entry passes the AgentPermissionEntry schema', () => {
    for (const cls of AgentPermissionClass.options) {
      const r = AgentPermissionEntry.safeParse(AGENT_PERMISSION_TAXONOMY[cls])
      expect(r.success).toBe(true)
    }
  })

  it('every entry class field matches its map key', () => {
    for (const [key, entry] of Object.entries(AGENT_PERMISSION_TAXONOMY)) {
      expect(entry.class).toBe(key)
    }
  })

  it('read-only classes forbid Edit and Bash', () => {
    const readOnly = [
      'reviewer',
      'analyzer',
      'explorer',
      'hunter',
      'surfacer',
      'validator',
      'verifier',
      'selector',
    ] as const
    for (const cls of readOnly) {
      const entry = AGENT_PERMISSION_TAXONOMY[cls]
      expect(entry.scope).toBe('read-only')
      expect(entry.forbiddenTools).toEqual(
        expect.arrayContaining(['Edit', 'Bash']),
      )
      expect(entry.allowedTools).not.toContain('Edit')
      expect(entry.allowedTools).not.toContain('Bash')
    }
  })

  it('write-capable classes allow Edit and Bash with empty forbidden set', () => {
    const writeCapable = [
      'architect',
      'orchestrator',
      'builder',
      'resolver',
      'simplifier',
      'worker',
    ] as const
    for (const cls of writeCapable) {
      const entry = AGENT_PERMISSION_TAXONOMY[cls]
      expect(entry.scope).toBe('write-capable')
      expect(entry.forbiddenTools).toEqual([])
      expect(entry.allowedTools).toEqual(
        expect.arrayContaining(['Edit', 'Bash']),
      )
    }
  })

  it('is frozen at the module level', () => {
    expect(Object.isFrozen(AGENT_PERMISSION_TAXONOMY)).toBe(true)
  })
})

describe('classifyAgentSuffix()', () => {
  // The classifier is a pure suffix-matching function — slugs need not name a
  // currently-shipped agent.  ANV-0083 collapsed `assumptions-surfacer` and
  // `retroactive-validator` into sibling prompts, but the suffix classes
  // (`surfacer`, `validator`) remain valid taxonomy entries that future agents
  // may use, so we retain illustrative slugs to cover them.
  it.each([
    ['code-reviewer', 'reviewer'],
    ['test-analyzer', 'analyzer'],
    ['code-explorer', 'explorer'],
    ['silent-failure-hunter', 'hunter'],
    ['assumptions-surfacer', 'surfacer'],
    ['plan-verifier', 'verifier'],
    ['retroactive-validator', 'validator'],
    ['framework-selector', 'selector'],
    ['code-architect', 'architect'],
    ['orchestrator', 'orchestrator'],
    ['mcp-builder', 'builder'],
    ['build-error-resolver', 'resolver'],
    ['code-simplifier', 'simplifier'],
    ['ultra-worker', 'worker'],
  ])('classifies %s as %s', (slug, expected) => {
    expect(classifyAgentSuffix(slug)).toBe(expected)
  })

  it('returns null for slugs without a recognised suffix', () => {
    expect(classifyAgentSuffix('researcher')).toBeNull()
    expect(classifyAgentSuffix('foo')).toBeNull()
    expect(classifyAgentSuffix('')).toBeNull()
  })

  it('matches bare-class names', () => {
    expect(classifyAgentSuffix('worker')).toBe('worker')
    expect(classifyAgentSuffix('reviewer')).toBe('reviewer')
  })

  it('does not match partial suffixes', () => {
    expect(classifyAgentSuffix('preview')).toBeNull()
    expect(classifyAgentSuffix('overworked')).toBeNull()
  })
})
