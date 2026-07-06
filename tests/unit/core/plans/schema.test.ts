/**
 * Unit tests for src/core/plans/schema.ts (ANV-0026).
 *
 * Each cross-field invariant has its own `it` block. The happy-path fixture
 * (`makeGoodPlan`) is the minimum valid plan; reject cases mutate one field
 * to flip exactly one rule.
 */

import { describe, expect, it } from 'vitest'
import {
  ExecutablePlan,
  PlanTask,
  PlanWave,
} from '../../../../src/core/plans/schema.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeGoodPlan() {
  return {
    version: 'v0.14.0',
    theme: 'Test theme',
    composition: {
      debt: 0,
      improvements: 0,
      additions: 1,
      fixes: 0,
      docs: 0,
    },
    waves: [
      {
        id: 'wave-1',
        tasks: ['A1', 'A2'],
        parallelism: 'parallel' as const,
      },
      {
        id: 'wave-2',
        tasks: ['A3'],
        parallelism: 'sequential' as const,
      },
    ],
    tasks: [
      {
        id: 'A1',
        title: 'First task',
        type: 'feature' as const,
        effort: 's' as const,
        depends_on: [],
        write_scope: ['src/foo/**'],
        verification: ['bun test tests/unit/foo.test.ts'],
      },
      {
        id: 'A2',
        title: 'Second task',
        type: 'fix' as const,
        effort: 'xs' as const,
        depends_on: [],
        write_scope: ['src/bar/*.ts'],
        verification: ['bun test'],
      },
      {
        id: 'A3',
        title: 'Third task — depends on A1 + A2',
        type: 'test' as const,
        effort: 'm' as const,
        depends_on: ['A1', 'A2'],
        write_scope: ['tests/**'],
        verification: ['bun test'],
      },
    ],
    exit_criteria: ['All tests pass'],
  }
}

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('ExecutablePlan — happy path', () => {
  it('accepts a fully-specified plan', () => {
    const result = ExecutablePlan.safeParse(makeGoodPlan())
    expect(result.success).toBe(true)
  })

  it('defaults waves / depends_on / write_scope / verification when omitted', () => {
    const minimal = {
      version: 'v0.14.0',
      theme: 'Theme',
      tasks: [
        {
          id: 'A1',
          title: 'Lonely task',
          type: 'feature' as const,
          effort: 's' as const,
        },
      ],
    }
    const result = ExecutablePlan.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.waves).toEqual([])
      expect(result.data.exit_criteria).toEqual([])
      expect(result.data.tasks[0]?.depends_on).toEqual([])
      expect(result.data.tasks[0]?.write_scope).toEqual([])
      expect(result.data.tasks[0]?.verification).toEqual([])
    }
  })

  it('accepts both "v0.14.0" and "0.14.0" version forms', () => {
    const p1 = { ...makeGoodPlan(), version: 'v0.14.0' }
    const p2 = { ...makeGoodPlan(), version: '0.14.0' }
    expect(ExecutablePlan.safeParse(p1).success).toBe(true)
    expect(ExecutablePlan.safeParse(p2).success).toBe(true)
  })
})

// ─── Field-level validation ──────────────────────────────────────────────────

describe('PlanTask — field validation', () => {
  it('rejects malformed task IDs', () => {
    const bad = PlanTask.safeParse({
      id: 'lowercase',
      title: 'x',
      type: 'feature',
      effort: 's',
    })
    expect(bad.success).toBe(false)
  })

  it('accepts `A1`, `B12`, `C3.1`', () => {
    for (const id of ['A1', 'B12', 'C3.1']) {
      const r = PlanTask.safeParse({
        id,
        title: 't',
        type: 'feature',
        effort: 's',
      })
      expect(r.success, `id=${id}`).toBe(true)
    }
  })

  it('rejects empty titles', () => {
    const r = PlanTask.safeParse({
      id: 'A1',
      title: '',
      type: 'feature',
      effort: 's',
    })
    expect(r.success).toBe(false)
  })

  it('rejects invalid type / effort enum values', () => {
    const r1 = PlanTask.safeParse({
      id: 'A1',
      title: 't',
      type: 'banana',
      effort: 's',
    })
    expect(r1.success).toBe(false)
    const r2 = PlanTask.safeParse({
      id: 'A1',
      title: 't',
      type: 'feature',
      effort: 'huge',
    })
    expect(r2.success).toBe(false)
  })
})

describe('PlanWave — field validation', () => {
  it('rejects wave IDs without the wave- prefix', () => {
    const r = PlanWave.safeParse({
      id: 'foundation',
      tasks: ['A1'],
      parallelism: 'parallel',
    })
    expect(r.success).toBe(false)
  })

  it('accepts wave-1, wave-foundation, wave-2a', () => {
    for (const id of ['wave-1', 'wave-foundation', 'wave-2a']) {
      const r = PlanWave.safeParse({
        id,
        tasks: ['A1'],
        parallelism: 'sequential',
      })
      expect(r.success, `id=${id}`).toBe(true)
    }
  })

  it('rejects empty task arrays', () => {
    const r = PlanWave.safeParse({
      id: 'wave-1',
      tasks: [],
      parallelism: 'parallel',
    })
    expect(r.success).toBe(false)
  })
})

// ─── Write-scope glob shape ──────────────────────────────────────────────────

describe('write_scope glob shape', () => {
  it.each([
    ['empty', ''],
    ['absolute path', '/etc/passwd'],
    ['root parent-traversal', '../something'],
    ['leading whitespace', ' src/**'],
    ['bare double-star', '**'],
    ['embedded NUL', 'src/\0/foo'],
  ])('rejects %s', (_label, glob) => {
    const plan = makeGoodPlan()
    plan.tasks[0]!.write_scope = [glob]
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
  })

  it.each([
    ['simple file', 'src/foo.ts'],
    ['recursive glob', 'src/foo/**'],
    ['extension glob', 'src/**/*.ts'],
    ['dot-file', '.anvil/plans/*.md'],
  ])('accepts %s', (_label, glob) => {
    const plan = makeGoodPlan()
    plan.tasks[0]!.write_scope = [glob]
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(true)
  })
})

// ─── Cross-field invariants ──────────────────────────────────────────────────

describe('ExecutablePlan — cross-field invariants', () => {
  it('rejects duplicate task IDs', () => {
    const plan = makeGoodPlan()
    plan.tasks.push({
      id: 'A1', // dup
      title: 'Dup',
      type: 'fix',
      effort: 'xs',
      depends_on: [],
      write_scope: [],
      verification: [],
    })
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => /duplicate task ID/.test(i.message)),
      ).toBe(true)
    }
  })

  it('rejects depends_on that references unknown task', () => {
    const plan = makeGoodPlan()
    plan.tasks[2]!.depends_on = ['A1', 'A99'] // A99 does not exist
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) =>
          /depends on unknown task "A99"/.test(i.message),
        ),
      ).toBe(true)
    }
  })

  it('rejects self-dependencies', () => {
    const plan = makeGoodPlan()
    plan.tasks[0]!.depends_on = ['A1']
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => /cannot depend on itself/.test(i.message)),
      ).toBe(true)
    }
  })

  it('detects a 2-node dependency cycle', () => {
    const plan = makeGoodPlan()
    plan.tasks[0]!.depends_on = ['A2']
    plan.tasks[1]!.depends_on = ['A1']
    plan.tasks[2]!.depends_on = []
    // Clear waves so wave-ordering rule doesn't compete
    plan.waves = []
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => /dependency cycle detected/.test(i.message)),
      ).toBe(true)
    }
  })

  it('detects a 3-node dependency cycle', () => {
    const plan = makeGoodPlan()
    plan.tasks[0]!.depends_on = ['A3']
    plan.tasks[1]!.depends_on = ['A1']
    plan.tasks[2]!.depends_on = ['A2']
    plan.waves = []
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => /dependency cycle detected/.test(i.message)),
      ).toBe(true)
    }
  })

  it('rejects duplicate wave IDs', () => {
    const plan = makeGoodPlan()
    plan.waves[1]!.id = 'wave-1' // collides with waves[0]
    plan.waves[1]!.tasks = ['A3']
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => /duplicate wave ID/.test(i.message)),
      ).toBe(true)
    }
  })

  it('rejects wave that references an unknown task', () => {
    const plan = makeGoodPlan()
    plan.waves[0]!.tasks = ['A1', 'A99']
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) =>
          /references unknown task "A99"/.test(i.message),
        ),
      ).toBe(true)
    }
  })

  it('rejects a task appearing in multiple waves', () => {
    const plan = makeGoodPlan()
    plan.waves[1]!.tasks = ['A1', 'A3'] // A1 is already in wave-1
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => /appears in multiple waves/.test(i.message)),
      ).toBe(true)
    }
  })

  it('rejects forward wave-ordering dependency (dep in later wave)', () => {
    const plan = makeGoodPlan()
    // A1 (wave-1) depends on A3 (wave-2) → forbidden.
    plan.tasks[0]!.depends_on = ['A3']
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) =>
          /which runs in a later wave/.test(i.message),
        ),
      ).toBe(true)
    }
  })

  it('allows a task to be outside any wave', () => {
    const plan = makeGoodPlan()
    // Remove A3 from wave-2 entirely. The schema does not require every task
    // to live inside a wave — waves are a hint to the runner, not mandatory.
    plan.waves = [plan.waves[0]!]
    const r = ExecutablePlan.safeParse(plan)
    expect(r.success).toBe(true)
  })
})

// ─── Empty / boundary cases ──────────────────────────────────────────────────

describe('ExecutablePlan — boundary cases', () => {
  it('rejects a plan with zero tasks', () => {
    const r = ExecutablePlan.safeParse({
      version: 'v0.14.0',
      theme: 'theme',
      tasks: [],
    })
    expect(r.success).toBe(false)
  })

  it('rejects an empty theme', () => {
    const r = ExecutablePlan.safeParse({
      version: 'v0.14.0',
      theme: '',
      tasks: [{ id: 'A1', title: 't', type: 'feature', effort: 's' }],
    })
    expect(r.success).toBe(false)
  })

  it('rejects a bogus version string', () => {
    const r = ExecutablePlan.safeParse({
      version: 'not-a-semver',
      theme: 'theme',
      tasks: [{ id: 'A1', title: 't', type: 'feature', effort: 's' }],
    })
    expect(r.success).toBe(false)
  })
})
