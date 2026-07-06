/**
 * ANV-0245 — Experimental feature registry.
 *
 * The registry is DATA, not feature code — it lives in src/core/ so that
 * doctor rows in the default build can read it without pulling in the
 * experimental tree.
 *
 * Layer 0 (core). No I/O. No imports from layers 1+.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExperimentalFeature {
  /** Machine-readable identifier. Must be unique across all registered features. */
  id: string
  /** Human-readable display name. */
  title: string
  /** Lifecycle stage of this feature. */
  status: 'inflight' | 'paused' | 'graduating'
  /**
   * Completion percentage (0–100). Reflects implementation completeness as a
   * rough estimate; updated manually when a move ticket changes scope.
   */
  progress: number
  /** ANV-NNNN ticket that owns this feature's move/implementation. */
  ownerTicket: string
  /**
   * Intended graduation target version (e.g. "v1.0.0"). Optional — set once
   * the feature is on the roadmap for a specific release.
   */
  graduationTarget?: string
  /**
   * Open follow-up items for this feature (e.g. schema gaps, pending work).
   * Rendered in the doctor row when non-empty.
   */
  followups?: string[]
}

// ─── Seed data ────────────────────────────────────────────────────────────────

/**
 * Canonical seed entries. These are the three features in the experimental
 * pipeline as of ANV-0245. Progress is set to 75% for each — they are
 * functionally complete but not yet separated from the default build.
 */
const SEED_FEATURES: ExperimentalFeature[] = [
  {
    id: 'catalog',
    title: 'Skill Catalog',
    status: 'inflight',
    progress: 75,
    ownerTicket: 'ANV-0028',
    followups: [
      'tools[]',
      'parseIndex',
      'tree-listing',
      'wshobson',
      '--purge-blobs',
    ],
  },
  {
    id: 'notepads',
    title: 'Notepads',
    status: 'inflight',
    progress: 75,
    ownerTicket: 'ANV-0247',
  },
  {
    id: 'extensions',
    title: 'Extensions',
    status: 'inflight',
    progress: 75,
    ownerTicket: 'ANV-0248',
    followups: ['manifest schema: tools[]', 'manifest schema: required_env'],
  },
]

// ─── Registry state ───────────────────────────────────────────────────────────

/** Mutable runtime registry — starts as a copy of the seed data. */
let _registry: ExperimentalFeature[] = SEED_FEATURES.map((f) => ({ ...f }))

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a snapshot of all registered experimental features.
 *
 * The returned array is a shallow copy — callers may not mutate the registry
 * by pushing to the array. Individual feature objects are also copies.
 */
export function listExperimentalFeatures(): ExperimentalFeature[] {
  return _registry.map((f) => ({ ...f }))
}

/**
 * Returns the experimental feature with the given id, or undefined if not found.
 */
export function getExperimentalFeature(
  id: string,
): ExperimentalFeature | undefined {
  const entry = _registry.find((f) => f.id === id)
  return entry === undefined ? undefined : { ...entry }
}

/**
 * Registers a new experimental feature at runtime.
 *
 * Throws if:
 *   - A feature with the same `id` is already registered (duplicate guard).
 *   - `progress` is outside the 0–100 range (validation).
 *
 * Runtime registration is used by plugin / extension code that loads after
 * the module initialises. The test helper `__resetForTests()` undoes any
 * runtime registrations.
 */
export function registerExperimentalFeature(
  feature: ExperimentalFeature,
): void {
  if (feature.progress < 0 || feature.progress > 100) {
    throw new RangeError(
      `experimental-registry: progress must be 0–100, got ${feature.progress} for feature "${feature.id}"`,
    )
  }
  if (_registry.some((f) => f.id === feature.id)) {
    throw new Error(
      `experimental-registry: duplicate feature id "${feature.id}"`,
    )
  }
  _registry.push({ ...feature })
}

// ─── Test helper ─────────────────────────────────────────────────────────────

/**
 * Resets the registry to the seed state.
 *
 * ONLY for use in tests. Never call in production code.
 *
 * @internal
 */
export function __resetForTests(): void {
  _registry = SEED_FEATURES.map((f) => ({ ...f }))
}
