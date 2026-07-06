/**
 * Pure path helpers for the SDD artifact layer (Plan 36 Phase C).
 *
 * Layer 0 — no I/O, no imports from higher layers.
 * All functions return relative paths from the project root.
 */

const FEATURE_BASE = '.anvil/specs/features'
const LEADING_DATE_RE = /^\d{4}-\d{2}-\d{2}-/

/**
 * Normalize a feature name or slug to a valid kebab-case slug.
 *
 * Rules:
 *  - Strip leading date prefix (YYYY-MM-DD-)
 *  - Lowercase
 *  - Replace whitespace with hyphens
 *  - Strip non-[a-z0-9-] characters
 *  - Collapse repeated hyphens
 *  - Trim leading/trailing hyphens
 *  - Throw if the result is empty
 */
export function normalizeSlug(input: string): string {
  let s = input

  // Strip leading date prefix (e.g. "2026-04-26-feature-x" → "feature-x")
  if (LEADING_DATE_RE.test(s)) {
    s = s.replace(LEADING_DATE_RE, '')
  }

  s = s
    .toLowerCase()
    .replace(/\s+/g, '-') // whitespace → hyphen
    .replace(/[^a-z0-9-]/g, '') // strip non-[a-z0-9-]
    .replace(/-{2,}/g, '-') // collapse repeated hyphens
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens

  if (s.length === 0) {
    throw new Error(
      `normalizeSlug: empty slug after normalization (input: ${JSON.stringify(input)})`,
    )
  }

  return s
}

/**
 * Returns the canonical feature directory relative to the project root.
 * Example: featureDir('demo') → '.anvil/specs/features/demo'
 */
export function featureDir(slug: string): string {
  return `${FEATURE_BASE}/${normalizeSlug(slug)}`
}

/**
 * Returns the path to the spec artifact for a feature.
 * Example: specPath('demo') → '.anvil/specs/features/demo/spec.md'
 */
export function specPath(slug: string): string {
  return `${featureDir(slug)}/spec.md`
}

/**
 * Returns the path to the plan artifact for a feature.
 * Example: planPath('demo') → '.anvil/specs/features/demo/plan.md'
 */
export function planPath(slug: string): string {
  return `${featureDir(slug)}/plan.md`
}

/**
 * Returns the path to the tasks artifact for a feature.
 * Example: tasksPath('demo') → '.anvil/specs/features/demo/tasks.md'
 */
export function tasksPath(slug: string): string {
  return `${featureDir(slug)}/tasks.md`
}
