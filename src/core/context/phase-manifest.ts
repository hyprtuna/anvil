/**
 * phase-manifest.ts — declarative per-phase context manifest (ANV-0019).
 *
 * Maps each workflow phase to an ordered list of `ContextEntry` records that
 * the artifact-loader resolves and reads at SessionStart. Entries reference
 * artefacts via the ANV-0134 token vocabulary (e.g. `${ANVIL_PLANS_DIR}`),
 * never via literal repo-relative paths.
 *
 * Layer 0 — pure data + Zod schema. No I/O. Safe to import from anywhere.
 *
 * Per ANV-0019 ticket Notes: the manifest is a declarative table; the loader
 * is composed from it; the truncation primitive (markdown-truncate.ts) is
 * pure and consumed by the loader.
 */
import { z } from 'zod'
import { ARTIFACT_TOKENS } from '../artifact-paths.js'

// ─── Phase enum ───────────────────────────────────────────────────────────────

/**
 * Workflow phases recognised by the loader. Mirrors `AnvilState.phase`
 * (`src/core/types.ts`). Kept as a local constant so this module stays
 * importable without a back-reference into the state schema.
 */
export const PHASE_KEYS = [
  'research',
  'spec',
  'plan',
  'tasks',
  'implement',
  'verify',
  'review',
  'finish',
  'none',
] as const

export type PhaseKey = (typeof PHASE_KEYS)[number]

/**
 * Artefact kinds supported by the loader. Mirrors the ticket's explicit
 * "in scope" list (`spec | plan | tasks | release-slate | notepad`).
 */
export const ARTIFACT_KINDS = [
  'spec',
  'plan',
  'tasks',
  'release-slate',
  'notepad',
] as const

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]

// ─── Zod schema ───────────────────────────────────────────────────────────────

/**
 * A token-rich relative path. Must contain at least one `${TOKEN}` reference
 * drawn from `ARTIFACT_TOKENS`, and must NOT begin with `.anvil/`,
 * `docs/anvil/`, or any other repo-relative literal that ANV-0134 forbids.
 * The architecture guard separately enforces the literal-path ban.
 */
const TOKEN_PATTERN = /\$\{([A-Z][A-Z0-9_]*)\}/g

export const ContextEntry = z
  .object({
    /** Logical kind of this artefact. */
    kind: z.enum(ARTIFACT_KINDS),
    /**
     * Tokenised path expression (e.g. `${ANVIL_FEATURES_DIR}/<slug>/spec.md`).
     * Resolved at load time via `substituteArtifactTokens`. Must reference
     * at least one ANV-0134 token; literal repo-relative paths are forbidden.
     */
    pathExpr: z.string().min(1),
    /** Per-artefact char budget (within the aggregate cap). */
    maxBytes: z.number().int().positive(),
    /**
     * Priority used to break ties under aggregate-budget pressure.
     * Higher = preferred when the loader must drop entries.
     */
    priority: z.number().int().nonnegative(),
    /** Required artefacts emit a stderr warning when missing (non-blocking). */
    required: z.boolean(),
  })
  .strict()
  .refine(
    (entry) => {
      // Every pathExpr MUST contain at least one known token.
      const matches = [...entry.pathExpr.matchAll(TOKEN_PATTERN)]
      if (matches.length === 0) return false
      return matches.every((m) =>
        (ARTIFACT_TOKENS as readonly string[]).includes(m[1] ?? ''),
      )
    },
    {
      message:
        'pathExpr must reference at least one known ANV-0134 token (${ANVIL_*} / ${BACKLOG_FILE} / ${ROADMAP_FILE})',
    },
  )

export type ContextEntry = z.infer<typeof ContextEntry>

export const PhaseManifest = z
  .record(z.enum(PHASE_KEYS), z.array(ContextEntry))
  .refine((rec) => (PHASE_KEYS as readonly string[]).every((k) => k in rec), {
    message: 'PhaseManifest must define an entry list for every PhaseKey',
  })

export type PhaseManifest = z.infer<typeof PhaseManifest>

// ─── The default manifest ─────────────────────────────────────────────────────

/**
 * Default phase → entries mapping shipped with Anvil.
 *
 * Aggregate cap is enforced by the loader (6 KB per ANV-0019 / OMC §9).
 * Per-entry `maxBytes` sums per phase should stay under that cap; the loader
 * sorts by `priority` (descending) and drops the lowest-priority entries
 * when the aggregate would overflow.
 *
 * `<slug>` is a literal placeholder; the loader substitutes it with the
 * active feature slug (from `AnvilState.feature_slug`) before resolving.
 */
export const DEFAULT_PHASE_MANIFEST: PhaseManifest = {
  research: [],
  spec: [
    {
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 100,
      required: true,
    },
    {
      kind: 'release-slate',
      pathExpr: '${ANVIL_PLANS_DIR}',
      maxBytes: 512,
      priority: 50,
      required: false,
    },
  ],
  plan: [
    {
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 100,
      required: true,
    },
    {
      kind: 'plan',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/plan.md',
      maxBytes: 1536,
      priority: 90,
      required: true,
    },
    {
      kind: 'release-slate',
      pathExpr: '${ANVIL_PLANS_DIR}',
      maxBytes: 512,
      priority: 50,
      required: false,
    },
  ],
  tasks: [
    {
      kind: 'plan',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/plan.md',
      maxBytes: 1536,
      priority: 100,
      required: true,
    },
    {
      kind: 'tasks',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/tasks.md',
      maxBytes: 512,
      priority: 80,
      required: false,
    },
    {
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 60,
      required: false,
    },
  ],
  implement: [
    {
      kind: 'plan',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/plan.md',
      maxBytes: 1536,
      priority: 100,
      required: true,
    },
    {
      kind: 'tasks',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/tasks.md',
      maxBytes: 512,
      priority: 80,
      required: false,
    },
    {
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 60,
      required: false,
    },
  ],
  verify: [
    {
      kind: 'plan',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/plan.md',
      maxBytes: 1024,
      priority: 100,
      required: false,
    },
    {
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 80,
      required: false,
    },
    {
      kind: 'tasks',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/tasks.md',
      maxBytes: 512,
      priority: 60,
      required: false,
    },
  ],
  review: [
    {
      kind: 'plan',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/plan.md',
      maxBytes: 1024,
      priority: 100,
      required: false,
    },
    {
      kind: 'spec',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/spec.md',
      maxBytes: 1024,
      priority: 80,
      required: false,
    },
    {
      kind: 'tasks',
      pathExpr: '${ANVIL_FEATURES_DIR}/<slug>/tasks.md',
      maxBytes: 512,
      priority: 60,
      required: false,
    },
  ],
  finish: [
    {
      kind: 'release-slate',
      pathExpr: '${ANVIL_PLANS_DIR}',
      maxBytes: 512,
      priority: 100,
      required: false,
    },
  ],
  none: [],
}

// Validate at module load so import-time misconfiguration is caught early.
// Throws a ZodError with a precise path if the default manifest drifts from
// the schema (e.g. a token typo or a missing PhaseKey).
PhaseManifest.parse(DEFAULT_PHASE_MANIFEST)

/**
 * Returns the entry list for `phase` from `manifest` (defaults to the
 * shipped manifest). Returns an empty array when the phase has no entries.
 */
export function entriesForPhase(
  phase: PhaseKey,
  manifest: PhaseManifest = DEFAULT_PHASE_MANIFEST,
): ContextEntry[] {
  return manifest[phase] ?? []
}

/**
 * Returns the set of unique ANV-0134 tokens referenced by every `pathExpr`
 * in `manifest`. Consumed by the `phase-manifest artifacts resolve` doctor
 * row to assert all referenced tokens are known.
 */
export function referencedTokens(
  manifest: PhaseManifest = DEFAULT_PHASE_MANIFEST,
): string[] {
  const tokens = new Set<string>()
  for (const phase of PHASE_KEYS) {
    for (const entry of manifest[phase] ?? []) {
      for (const m of entry.pathExpr.matchAll(TOKEN_PATTERN)) {
        const name = m[1]
        if (name) tokens.add(name)
      }
    }
  }
  return [...tokens]
}
