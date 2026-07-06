import { describe, expect, it } from 'vitest'
import type { ProjectContext } from '../../../../src/core/types.js'
import {
  detectValidationCoverage,
  parsePlanMarkdown,
} from '../../../../src/core/validation/detect.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// ANV-0131: plans moved to .anvil/_archive/docs-anvil/plans/
const PLAN_PATH =
  '.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md'

function makeProject(testRunners: string[]): ProjectContext {
  return {
    languages: [],
    frameworks: [],
    testRunners,
    ci: [],
    detectedAt: new Date().toISOString(),
  }
}

const MINIMAL_PLAN_MD = `
# Plan 30

## Phase C — Nyquist

C1. **Concept.** Intro.

C2. **Schema.** ValidationMap Zod type. (S)

C3. **Detection.** \`src/core/validation/detect.ts\`. (M)
`

// ─── parsePlanMarkdown ────────────────────────────────────────────────────────

describe('parsePlanMarkdown', () => {
  it('extracts task IDs from Anvil-style phase headings', () => {
    const plan = parsePlanMarkdown(MINIMAL_PLAN_MD)
    const ids = plan.tasks.map((t) => t.id)
    expect(ids).toContain('C1')
    expect(ids).toContain('C2')
    expect(ids).toContain('C3')
  })

  it('deduplicates repeated task IDs', () => {
    const md = `
C1. **First.** Something.
C1. **Duplicate.** Should not appear twice.
`
    const plan = parsePlanMarkdown(md)
    expect(plan.tasks.filter((t) => t.id === 'C1')).toHaveLength(1)
  })

  it('returns empty tasks for a doc with no matching headings', () => {
    const plan = parsePlanMarkdown('# Just a heading\n\nSome prose.\n')
    expect(plan.tasks).toHaveLength(0)
  })

  it('extracts titles correctly', () => {
    const plan = parsePlanMarkdown(MINIMAL_PLAN_MD)
    const c2 = plan.tasks.find((t) => t.id === 'C2')
    expect(c2?.title).toBeTruthy()
    expect(c2?.title).toContain('Schema')
  })
})

// ─── detectValidationCoverage ─────────────────────────────────────────────────

describe('detectValidationCoverage — runner table', () => {
  const plan = parsePlanMarkdown(MINIMAL_PLAN_MD)

  it('generates vitest commands when vitest is detected', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['vitest']),
      PLAN_PATH,
    )
    expect(map.detected_runners).toContain('vitest')
    expect(map.uncovered_tasks).toHaveLength(0)
    for (const entry of map.entries) {
      expect(entry.test_command).toMatch(/^npm test/)
    }
  })

  it('generates jest commands when jest is detected', () => {
    const map = detectValidationCoverage(plan, makeProject(['jest']), PLAN_PATH)
    expect(map.detected_runners).toContain('jest')
    expect(map.uncovered_tasks).toHaveLength(0)
    for (const entry of map.entries) {
      expect(entry.test_command).toMatch(/^npm test/)
    }
  })

  it('generates pytest commands when pytest is detected', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['pytest']),
      PLAN_PATH,
    )
    expect(map.detected_runners).toContain('pytest')
    for (const entry of map.entries) {
      expect(entry.test_command).toMatch(/^pytest/)
    }
  })

  it('generates go test commands when go-test is detected', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['go-test']),
      PLAN_PATH,
    )
    for (const entry of map.entries) {
      expect(entry.test_command).toBe('go test ./...')
    }
  })

  it('generates cargo test commands when cargo-test is detected', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['cargo-test']),
      PLAN_PATH,
    )
    for (const entry of map.entries) {
      expect(entry.test_command).toBe('cargo test')
    }
  })

  it('marks all tasks as uncovered when no runner is detected', () => {
    const map = detectValidationCoverage(plan, makeProject([]), PLAN_PATH)
    expect(map.entries).toHaveLength(0)
    expect(map.uncovered_tasks).toHaveLength(plan.tasks.length)
    for (const taskId of map.uncovered_tasks) {
      expect(plan.tasks.map((t) => t.id)).toContain(taskId)
    }
  })

  it('prefers vitest over jest when both are detected', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['jest', 'vitest']),
      PLAN_PATH,
    )
    // vitest has higher priority — commands should use the vitest pattern (glob)
    for (const entry of map.entries) {
      expect(entry.test_command).toMatch(/\*\*\//)
    }
  })

  it('sets plan_path correctly', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['vitest']),
      PLAN_PATH,
    )
    expect(map.plan_path).toBe(PLAN_PATH)
  })

  it('sets generated_at as a valid ISO string', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['vitest']),
      PLAN_PATH,
    )
    expect(() => new Date(map.generated_at).toISOString()).not.toThrow()
  })

  it('entries have empty file_paths and assertions by default', () => {
    const map = detectValidationCoverage(
      plan,
      makeProject(['vitest']),
      PLAN_PATH,
    )
    for (const entry of map.entries) {
      expect(entry.file_paths).toEqual([])
      expect(entry.assertions).toEqual([])
    }
  })
})
