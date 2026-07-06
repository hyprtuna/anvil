/**
 * Unit tests for src/core/plans/parse.ts (ANV-0026).
 *
 * Covers:
 *   - The string-input parser (`parseExecutablePlan`).
 *   - The file-input parser (`parseExecutablePlanFromFile`).
 *   - All four `ParseResult` reasons.
 *   - Integration: a real on-disk plan fixture parses cleanly.
 */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseExecutablePlan,
  parseExecutablePlanFromFile,
} from '../../../../src/core/plans/parse.js'

const FIXTURE_PLAN = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'plans',
  'sample.plan.md',
)

// ─── parseExecutablePlan (string input) ──────────────────────────────────────

describe('parseExecutablePlan', () => {
  it('returns no-frontmatter when the markdown has no YAML block', () => {
    const result = parseExecutablePlan('# Plan\n\nSome body.\n')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('no-frontmatter')
    }
  })

  it('returns no-executable-plan-key when frontmatter exists but lacks the key', () => {
    const md = `---
title: Some plan
status: draft
---

# Plan
`
    const result = parseExecutablePlan(md)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('no-executable-plan-key')
    }
  })

  it('returns schema-invalid when the executable_plan is malformed', () => {
    const md = `---
executable_plan:
  version: not-a-version
  theme: x
  tasks: []
---

# Plan
`
    const result = parseExecutablePlan(md)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('schema-invalid')
      if (result.reason === 'schema-invalid') {
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    }
  })

  it('returns ok with the parsed plan when frontmatter is valid', () => {
    const md = `---
executable_plan:
  version: v0.14.0
  theme: Test theme
  tasks:
    - id: A1
      title: First task
      type: feature
      effort: s
---

# Plan body
`
    const result = parseExecutablePlan(md)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.version).toBe('v0.14.0')
      expect(result.plan.tasks).toHaveLength(1)
      expect(result.plan.tasks[0]?.id).toBe('A1')
    }
  })

  it('surfaces a cross-field error (bad depends_on) as schema-invalid', () => {
    const md = `---
executable_plan:
  version: v0.14.0
  theme: Bad deps
  tasks:
    - id: A1
      title: t
      type: feature
      effort: s
      depends_on: [A2]
---
`
    const result = parseExecutablePlan(md)
    expect(result.ok).toBe(false)
    if (!result.ok && result.reason === 'schema-invalid') {
      expect(
        result.error.issues.some((i) =>
          /depends on unknown task "A2"/.test(i.message),
        ),
      ).toBe(true)
    }
  })
})

// ─── parseExecutablePlanFromFile ─────────────────────────────────────────────

describe('parseExecutablePlanFromFile', () => {
  it('throws on a missing file', async () => {
    await expect(
      parseExecutablePlanFromFile('/nonexistent/plan.md'),
    ).rejects.toThrow(/failed to read plan file/)
  })

  it('parses a valid plan file cleanly', async () => {
    const result = await parseExecutablePlanFromFile(FIXTURE_PLAN)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.version).toBe('v0.14.0')
      expect(result.plan.tasks.length).toBeGreaterThan(0)
    }
  })
})
