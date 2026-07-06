/**
 * Nyquist validation layer — detect.ts
 *
 * Layer 0 (core) — pure function, no I/O.
 * Maps each plan task to a test command based on the project's detected runners.
 */

import type { ProjectContext, ValidationMap } from '../types.js'

// ─── ParsedPlan ──────────────────────────────────────────────────────────────

export interface ParsedPlanTask {
  id: string
  title: string
  description?: string
}

export interface ParsedPlan {
  tasks: ParsedPlanTask[]
}

// ─── Runner → command heuristics ─────────────────────────────────────────────

const RUNNER_COMMAND: Record<string, (taskId: string) => string> = {
  vitest: (taskId) => `npm test -- ${taskIdToGlob(taskId)}`,
  jest: (taskId) => `npm test -- ${taskIdToPattern(taskId)}`,
  pytest: (taskId) => `pytest -k ${taskIdToSnake(taskId)}`,
  'go-test': (_taskId) => 'go test ./...',
  'cargo-test': (_taskId) => 'cargo test',
  phpunit: (taskId) => `./vendor/bin/phpunit --filter ${taskIdToSnake(taskId)}`,
  pest: (taskId) => `./vendor/bin/pest --filter ${taskIdToSnake(taskId)}`,
  rspec: (taskId) => `bundle exec rspec --tag ${taskIdToSnake(taskId)}`,
  playwright: (_taskId) => 'npx playwright test',
  cypress: (_taskId) => 'npx cypress run',
}

// Runner priority — first match wins if multiple runners are detected
const RUNNER_PRIORITY = [
  'vitest',
  'jest',
  'pytest',
  'go-test',
  'cargo-test',
  'phpunit',
  'pest',
  'rspec',
  'playwright',
  'cypress',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a task ID like "C2" or "A1" into a glob pattern for vitest */
function taskIdToGlob(taskId: string): string {
  const base = taskId.toLowerCase().replace(/\./g, '-')
  return `**/${base}*.test.ts`
}

/** Convert task ID to a jest pattern string (no path glob, just identifier) */
function taskIdToPattern(taskId: string): string {
  return taskId.toLowerCase().replace(/\./g, '-')
}

/** Convert task ID to snake_case identifier for pytest / phpunit */
function taskIdToSnake(taskId: string): string {
  return taskId.toLowerCase().replace(/[\s.]/g, '_')
}

/** Pick the highest-priority runner that is present in detectedRunners */
function pickRunner(detectedRunners: string[]): string | undefined {
  const detected = new Set(detectedRunners)
  return RUNNER_PRIORITY.find((r) => detected.has(r))
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Maps each task in the parsed plan to the test command that verifies it.
 *
 * Pure function — reads nothing from disk. All inputs are provided by the caller.
 *
 * @param plan    Pre-parsed plan with task list extracted from markdown headings.
 * @param project Project context produced by `detectProject()` (or equivalent).
 * @returns       A fully typed `ValidationMap` ready to serialise as JSON.
 */
export function detectValidationCoverage(
  plan: ParsedPlan,
  project: ProjectContext,
  planPath: string,
): ValidationMap {
  const detectedRunners = project.testRunners ?? []
  const primaryRunner = pickRunner(detectedRunners)
  const commandFn = primaryRunner ? RUNNER_COMMAND[primaryRunner] : undefined

  const entries: ValidationMap['entries'] = []
  const uncoveredTasks: string[] = []

  for (const task of plan.tasks) {
    if (commandFn) {
      entries.push({
        task_id: task.id,
        test_command: commandFn(task.id),
        file_paths: [],
        assertions: [],
      })
    } else {
      uncoveredTasks.push(task.id)
    }
  }

  return {
    plan_path: planPath,
    generated_at: new Date().toISOString(),
    detected_runners: detectedRunners,
    entries,
    uncovered_tasks: uncoveredTasks,
  }
}

// ─── Plan markdown parser ────────────────────────────────────────────────────

/**
 * Extract task IDs and titles from a plan markdown document.
 *
 * Recognises headings of the form:
 *   - `A1.`, `B2.`, `C3.` etc. (phase letter + number dot)
 *   - `### Task 1`, `### Task A1` etc.
 *   - Plain bold `**A1.**` at line start
 *
 * The pattern is deliberately broad so it works on Anvil-style plans without
 * requiring a strict schema.
 */
export function parsePlanMarkdown(markdown: string): ParsedPlan {
  const tasks: ParsedPlanTask[] = []

  // Match lines like: `A1.`, `B2.`, `C3.` with optional bold wrapper
  // Also matches `### A1.`, `### Task A1.` etc.
  const headingRe =
    /^(?:#{1,4}\s+)?(?:\*\*)?([A-Z]\d+(?:\.\d+)?)\.?\s+\*{0,2}(.+?)\*{0,2}(?:\s+\(.+\))?\s*$/

  // Also match `### TaskN.M` style used in some plan docs
  const taskRe = /^(?:#{1,4}\s+)(?:Task\s+)?([A-Z]\d+(?:\.\d+)?)[.:]\s*(.+)$/i

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = headingRe.exec(line) ?? taskRe.exec(line)
    if (match) {
      const id = match[1] ?? ''
      const title = (match[2] ?? '').trim()
      if (id && title) {
        // Deduplicate — a heading that already appears is skipped
        if (!tasks.some((t) => t.id === id)) {
          tasks.push({ id, title })
        }
      }
    }
  }

  return { tasks }
}
