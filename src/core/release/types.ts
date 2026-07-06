import { z } from 'zod'

/**
 * A validated semantic version string: "MAJOR.MINOR.PATCH"
 * with no pre-release or build-metadata suffix.
 */
export const SemverVersion = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'must be MAJOR.MINOR.PATCH with no suffix')
export type SemverVersion = z.infer<typeof SemverVersion>

/**
 * Parsed input for the `anvil release` command.
 */
export const ReleaseArgs = z.object({
  /** Target version to release (positional arg). */
  to: SemverVersion,
  /** Override source version (default: read from package.json). */
  from: SemverVersion.optional(),
  /** Print plan without writing any files. */
  dryRun: z.boolean().default(false),
  /** Emit the plan as JSON to stdout. */
  json: z.boolean().default(false),
  /** Skip dirty-working-tree guard. */
  allowDirty: z.boolean().default(false),
})
export type ReleaseArgs = z.infer<typeof ReleaseArgs>

/**
 * A single step in the release plan emitted to stdout.
 */
export const ReleasePlanStep = z.object({
  step: z.number().int().positive(),
  action: z.string(),
  target: z.string(),
  status: z.enum(['pending', 'done', 'skipped']).default('pending'),
})
export type ReleasePlanStep = z.infer<typeof ReleasePlanStep>

/**
 * The full structured plan produced (and optionally printed) by `anvil release`.
 */
export const ReleasePlan = z.object({
  from: SemverVersion,
  to: SemverVersion,
  dryRun: z.boolean(),
  isoDate: z.string(),
  steps: z.array(ReleasePlanStep),
  gitSuggestion: z.object({
    commitMessage: z.string(),
    tagName: z.string(),
    pushCommand: z.string(),
  }),
  prSuggestion: z
    .object({
      title: z.string(),
      body: z.string(),
    })
    .optional(),
})
export type ReleasePlan = z.infer<typeof ReleasePlan>
