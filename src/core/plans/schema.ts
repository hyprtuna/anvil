/**
 * Executable plan contracts (ANV-0026)
 *
 * Layer 0 (core) — pure Zod schemas, no I/O.
 *
 * Defines the structured shape an evented plan-runner (ANV-0025) will consume:
 * task IDs, dependencies, write scope, verification commands, execution waves.
 *
 * The shape is encoded as YAML frontmatter on each `.anvil/plans/v*.plan.md`
 * file under a top-level `executable_plan:` key. The markdown body stays as
 * human prose; the frontmatter is the machine-consumable contract.
 *
 * Scope of this module:
 *   - Define the schemas (`PlanTask`, `PlanWave`, `ExecutablePlan`).
 *   - Cross-field validation: dependency references resolve, no cycles,
 *     wave-task references resolve, write_scope globs are well-formed.
 *
 * Out of scope:
 *   - Reading or executing plans (parser lives in `parse.ts`; the runner
 *     lives in ANV-0025).
 *
 * Conventions:
 *   - Task IDs are short uppercase tokens like `A1`, `B2`, `C3.1` (matching
 *     the existing Anvil plan-heading convention parsed by
 *     `src/core/validation/detect.ts`).
 *   - Wave IDs use a separate namespace (`wave-1`, `wave-2`, ...) so they
 *     never collide with task IDs.
 *   - `write_scope` entries are POSIX-style glob patterns. Validation is
 *     intentionally loose — we only reject obviously malformed shapes
 *     (empty strings, leading whitespace) and let the runner enforce the
 *     stricter semantics.
 */

import { z } from 'zod'

// ─── Task ID format ──────────────────────────────────────────────────────────

/**
 * Task ID pattern: uppercase letter + digits, optionally `.digit` suffix.
 * Examples: `A1`, `B2`, `C3.1`, `D10`.
 *
 * Matches the existing plan-markdown heading convention in
 * `src/core/validation/detect.ts:parsePlanMarkdown`.
 */
export const TaskIdPattern = /^[A-Z]\d+(?:\.\d+)?$/

const TaskId = z
  .string()
  .regex(
    TaskIdPattern,
    'Task ID must match /^[A-Z]\\d+(?:\\.\\d+)?$/ (e.g. "A1", "C3.1")',
  )

// ─── Task type / effort ──────────────────────────────────────────────────────

/**
 * Task type mirrors ticket types and a few execution-flavored variants.
 * Kept loose intentionally — the runner doesn't branch on this; it's
 * declarative metadata for review and reporting.
 */
export const PlanTaskType = z.enum([
  'feature',
  'fix',
  'refactor',
  'debt',
  'test',
  'docs',
  'chore',
  'infra',
  'enhancement',
  'architecture',
  'policy',
  'doctor',
])
export type PlanTaskType = z.infer<typeof PlanTaskType>

/** Effort scale mirrors ticket-frontmatter t-shirt sizing. */
export const PlanTaskEffort = z.enum(['xs', 's', 'm', 'l', 'xl'])
export type PlanTaskEffort = z.infer<typeof PlanTaskEffort>

// ─── Glob validation ─────────────────────────────────────────────────────────

/**
 * Validate a write_scope entry is a well-shaped glob.
 *
 * We accept any non-empty string that does not begin or end with whitespace
 * and contains no NUL byte. We reject path-traversal segments (`..`) at the
 * root and absolute paths — write scopes are always project-relative.
 *
 * Looseness is deliberate: the runner (ANV-0025) is the authority on what
 * a "valid" glob resolves to on disk. The schema's job is to catch typos
 * and obvious malformations, not duplicate minimatch's grammar.
 */
function isValidGlobShape(s: string): boolean {
  if (s.length === 0) return false
  if (s !== s.trim()) return false
  if (s.includes('\0')) return false
  if (s.startsWith('/')) return false // absolute paths not allowed
  if (s.startsWith('..')) return false // root-relative parent traversal
  // Reject "**" without any context — must be part of a larger pattern.
  if (s === '**') return false
  return true
}

const WriteScopeGlob = z.string().refine(isValidGlobShape, (val) => ({
  message: `write_scope entry "${val}" is not a valid glob shape (non-empty, trimmed, project-relative)`,
}))

// ─── PlanTask ────────────────────────────────────────────────────────────────

/**
 * A single executable task. The runner (ANV-0025) consumes this to dispatch
 * one unit of work and verify it.
 */
export const PlanTask = z.object({
  /** Unique task ID (e.g. `A1`, `C3.1`). */
  id: TaskId,
  /** Human-readable one-line title. */
  title: z.string().min(1, 'title must be non-empty'),
  /** Task category — informational, used in reports. */
  type: PlanTaskType,
  /** T-shirt effort sizing. */
  effort: PlanTaskEffort,
  /**
   * Tasks this one waits on. References MUST resolve to other task IDs
   * in the same plan (cross-field validation enforced in ExecutablePlan).
   */
  depends_on: z.array(TaskId).default([]),
  /**
   * Paths or globs this task is allowed to write. The runner uses this
   * as a write-firewall — writes outside the scope are violations.
   */
  write_scope: z.array(WriteScopeGlob).default([]),
  /**
   * Commands the runner SHOULD invoke to verify this task succeeded.
   * Free-form strings (e.g. `bun test tests/unit/foo.test.ts`).
   *
   * Note: this schema does NOT execute these commands. The runner will.
   */
  verification: z.array(z.string().min(1)).default([]),
  /** Optional rough LOC estimate, for capacity planning. */
  estimated_loc: z.number().int().nonnegative().optional(),
  /**
   * Optional link to the originating ticket (e.g. `ANV-0026`). Informational.
   */
  ticket: z.string().optional(),
})
export type PlanTask = z.infer<typeof PlanTask>

// ─── PlanWave ────────────────────────────────────────────────────────────────

/** Wave ID: kebab-cased token prefixed with `wave-` (e.g. `wave-1`, `wave-foundation`). */
const WaveId = z
  .string()
  .regex(
    /^wave-[a-z0-9][a-z0-9-]*$/,
    'Wave ID must match /^wave-[a-z0-9][a-z0-9-]*$/ (e.g. "wave-1", "wave-foundation")',
  )

/**
 * An execution wave — a group of tasks that share a barrier with the
 * previous wave.
 *
 * `parallelism: parallel` means the runner MAY dispatch all tasks in this
 * wave concurrently (respecting their individual `depends_on` edges).
 * `parallelism: sequential` means the runner runs them in array order.
 */
export const PlanWave = z.object({
  id: WaveId,
  /** Task IDs (foreign keys into the plan's `tasks` array). */
  tasks: z.array(TaskId).min(1, 'a wave must contain at least one task'),
  parallelism: z.enum(['sequential', 'parallel']),
})
export type PlanWave = z.infer<typeof PlanWave>

// ─── Composition (mirror of plan-slate header) ───────────────────────────────

/**
 * Mirrors the "Composition" table at the top of each release slate. Kept
 * optional because not every plan will fill this in; the release policy
 * (docs/release-policy.md) enforces composition at the slate level, not
 * at the executable-plan level.
 */
export const PlanComposition = z.object({
  debt: z.number().int().nonnegative().default(0),
  improvements: z.number().int().nonnegative().default(0),
  additions: z.number().int().nonnegative().default(0),
  fixes: z.number().int().nonnegative().default(0),
  docs: z.number().int().nonnegative().default(0),
})
export type PlanComposition = z.infer<typeof PlanComposition>

// ─── ExecutablePlan ──────────────────────────────────────────────────────────

/** Semver pattern used to validate the plan's `version` field. */
const SemverPattern = /^v?\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/

/**
 * Top-level executable plan. This is the shape stored under the
 * `executable_plan:` key in each plan markdown file's frontmatter.
 *
 * Cross-field invariants (enforced via `.superRefine` below):
 *   1. Task IDs are unique.
 *   2. Wave IDs are unique.
 *   3. Every `depends_on` ID resolves to a real task.
 *   4. The dependency graph is acyclic.
 *   5. Every wave-task reference resolves to a real task.
 *   6. A task does not appear in more than one wave.
 *   7. A task's dependencies must already be satisfied by an earlier wave
 *      (waves are an ordering barrier — no forward references).
 */
export const ExecutablePlan = z
  .object({
    /** Release version this plan targets (e.g. `v0.14.0`). */
    version: z
      .string()
      .regex(SemverPattern, 'version must look like "v0.14.0" or "0.14.0"'),
    /** Plan theme (1-line headline, mirrors slate **Theme:** field). */
    theme: z.string().min(1),
    composition: PlanComposition.optional(),
    /** Ordered list of execution waves. Lower index runs first. */
    waves: z.array(PlanWave).default([]),
    /** Flat task list — the source of truth. Waves reference these by ID. */
    tasks: z.array(PlanTask).min(1, 'a plan must declare at least one task'),
    /**
     * Free-form exit-criteria checklist (mirror of the slate's "Exit criteria"
     * section). Informational — the runner does not auto-check these.
     */
    exit_criteria: z.array(z.string().min(1)).default([]),
  })
  .superRefine((plan, ctx) => {
    // (1) Unique task IDs
    const taskIds = new Set<string>()
    for (const [idx, t] of plan.tasks.entries()) {
      if (taskIds.has(t.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tasks', idx, 'id'],
          message: `duplicate task ID: ${t.id}`,
        })
      }
      taskIds.add(t.id)
    }

    // (2) Unique wave IDs
    const waveIds = new Set<string>()
    for (const [idx, w] of plan.waves.entries()) {
      if (waveIds.has(w.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['waves', idx, 'id'],
          message: `duplicate wave ID: ${w.id}`,
        })
      }
      waveIds.add(w.id)
    }

    // (3) depends_on resolves
    for (const [tIdx, t] of plan.tasks.entries()) {
      for (const [dIdx, dep] of t.depends_on.entries()) {
        if (!taskIds.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tasks', tIdx, 'depends_on', dIdx],
            message: `task "${t.id}" depends on unknown task "${dep}"`,
          })
        }
        if (dep === t.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tasks', tIdx, 'depends_on', dIdx],
            message: `task "${t.id}" cannot depend on itself`,
          })
        }
      }
    }

    // (4) Acyclic dependency graph (skip if any depends_on missing — issue
    //     already reported, cycle detection would just add noise).
    const allDepsValid = plan.tasks.every((t) =>
      t.depends_on.every((d) => taskIds.has(d) && d !== t.id),
    )
    if (allDepsValid) {
      const cycle = findCycle(plan.tasks)
      if (cycle) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tasks'],
          message: `dependency cycle detected: ${cycle.join(' -> ')}`,
        })
      }
    }

    // (5) Wave-task references resolve + (6) no task in multiple waves
    const seenInWave = new Map<string, string>() // task -> wave id
    for (const [wIdx, w] of plan.waves.entries()) {
      for (const [tIdx, taskRef] of w.tasks.entries()) {
        if (!taskIds.has(taskRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['waves', wIdx, 'tasks', tIdx],
            message: `wave "${w.id}" references unknown task "${taskRef}"`,
          })
          continue
        }
        const prior = seenInWave.get(taskRef)
        if (prior !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['waves', wIdx, 'tasks', tIdx],
            message: `task "${taskRef}" appears in multiple waves ("${prior}" and "${w.id}")`,
          })
        } else {
          seenInWave.set(taskRef, w.id)
        }
      }
    }

    // (7) Wave ordering: a task's deps must be in the same wave or earlier.
    if (plan.waves.length > 0 && allDepsValid) {
      const taskToWaveIndex = new Map<string, number>()
      for (const [wIdx, w] of plan.waves.entries()) {
        for (const taskRef of w.tasks) {
          if (!taskToWaveIndex.has(taskRef)) {
            taskToWaveIndex.set(taskRef, wIdx)
          }
        }
      }
      for (const [tIdx, t] of plan.tasks.entries()) {
        const tWave = taskToWaveIndex.get(t.id)
        if (tWave === undefined) continue // task not in any wave — allowed
        for (const [dIdx, dep] of t.depends_on.entries()) {
          const dWave = taskToWaveIndex.get(dep)
          if (dWave !== undefined && dWave > tWave) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['tasks', tIdx, 'depends_on', dIdx],
              message: `task "${t.id}" (wave index ${tWave}) depends on "${dep}" which runs in a later wave (index ${dWave})`,
            })
          }
        }
      }
    }
  })
export type ExecutablePlan = z.infer<typeof ExecutablePlan>

// ─── Cycle detection (DFS) ───────────────────────────────────────────────────

/**
 * DFS-based cycle detection on the `depends_on` graph.
 * Returns the cycle path (closed loop) if one exists, otherwise `null`.
 *
 * Complexity: O(V + E) — fine for plans that fit on a screen.
 */
function findCycle(tasks: readonly PlanTask[]): string[] | null {
  const adj = new Map<string, string[]>()
  for (const t of tasks) adj.set(t.id, t.depends_on.slice())

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const t of tasks) color.set(t.id, WHITE)

  const stack: string[] = []

  function visit(node: string): string[] | null {
    color.set(node, GRAY)
    stack.push(node)
    const deps = adj.get(node) ?? []
    for (const dep of deps) {
      const c = color.get(dep) ?? WHITE
      if (c === GRAY) {
        // Cycle: trim stack down to the recurring node and close the loop.
        const startIdx = stack.indexOf(dep)
        return [...stack.slice(startIdx), dep]
      }
      if (c === WHITE) {
        const found = visit(dep)
        if (found) return found
      }
    }
    stack.pop()
    color.set(node, BLACK)
    return null
  }

  for (const t of tasks) {
    if (color.get(t.id) === WHITE) {
      const result = visit(t.id)
      if (result) return result
    }
  }
  return null
}
