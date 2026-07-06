/**
 * artifact-loader.ts — phase-aware artifact context loader (ANV-0019).
 *
 * Loads bounded summaries of active project artifacts at SessionStart.
 * Composes the declarative phase manifest (`phase-manifest.ts`) with the
 * pure markdown-aware truncation primitive (`markdown-truncate.ts`) and
 * enforces a 6 KB aggregate context cap.
 *
 * Observability: when the aggregate budget is hit (entries dropped or
 * truncated), emits a structured JSON line on stderr for the dispatcher's
 * `session-start-overruns.jsonl` log (ANV-0056 / ANV-0023).
 *
 * Layer 0 — no imports from higher layers. Uses node: builtins plus the
 * sibling artifact-paths.ts resolver from ANV-0134.
 */

import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type ArtifactPathContext,
  substituteArtifactTokens,
} from '../artifact-paths.js'
import { truncateMarkdown } from './markdown-truncate.js'
import {
  type ContextEntry,
  DEFAULT_PHASE_MANIFEST,
  type ArtifactKind as ManifestArtifactKind,
  type PhaseKey,
  type PhaseManifest,
  entriesForPhase,
} from './phase-manifest.js'

// ─── Budget constants ─────────────────────────────────────────────────────────

/**
 * Default aggregate SessionStart context budget: 6 KB.
 * Per ANV-0019 ticket (mirrors OMC §9). Callers can override.
 */
export const SESSION_ARTIFACT_BUDGET_CHARS = 6 * 1024

/**
 * Re-export the manifest artifact-kind union under the legacy name so
 * callers built against the original API continue to compile.
 */
export type ArtifactKind = ManifestArtifactKind

/**
 * Legacy per-artifact char budgets. Retained for callers that opt out of
 * the manifest's per-entry `maxBytes` and want global defaults instead.
 */
export const ARTIFACT_BUDGETS: Record<ArtifactKind, number> = {
  spec: 1024,
  plan: 1536,
  tasks: 512,
  'release-slate': 512,
  notepad: 1024,
}

// ─── Legacy entry / loaded shapes (kept for back-compat) ──────────────────────

/**
 * A single artifact entry resolved to an absolute path.
 * Used by `buildPhaseManifest` / `loadArtifacts` legacy API.
 */
export interface ArtifactEntry {
  kind: ArtifactKind
  path: string
  required: boolean
}

export interface LoadedArtifact {
  kind: ArtifactKind
  path: string
  /** Content after budget-aware truncation. `undefined` when the file is missing. */
  content: string | undefined
  truncated: boolean
  missing: boolean
}

export interface ArtifactLoadResult {
  artifacts: LoadedArtifact[]
  totalChars: number
  budgetHit: boolean
  warnings: string[]
}

// ─── Phase manifest (legacy buildPhaseManifest) ───────────────────────────────

/**
 * Legacy: build a phase manifest by resolving the declarative manifest's
 * `pathExpr` for `phase` and substituting `<slug>` with `featureSlug`.
 *
 * Preserved for callers built before the declarative manifest landed.
 * New code should prefer `loadPhaseContext` which consumes the manifest
 * module directly.
 */
export function buildPhaseManifest(
  cwd: string,
  phase: string,
  featureSlug: string | undefined,
): ArtifactEntry[] {
  const phaseKey = phase as PhaseKey
  const entries = entriesForPhase(phaseKey)
  if (entries.length === 0) return []
  const ctx: ArtifactPathContext = {
    anvilRoot: cwd,
    projectRoot: cwd,
    scope: 'project',
  }
  return entries.map((entry) => {
    const resolved = resolveEntryPath(entry, ctx, featureSlug, cwd)
    return { kind: entry.kind, path: resolved, required: entry.required }
  })
}

/**
 * Resolve a `ContextEntry.pathExpr` to an absolute path, substituting
 * ANV-0134 tokens and the literal `<slug>` placeholder. When the pathExpr
 * resolves to a directory (e.g. `${ANVIL_PLANS_DIR}` for the
 * release-slate kind), look up the latest matching file.
 */
function resolveEntryPath(
  entry: ContextEntry,
  ctx: ArtifactPathContext,
  featureSlug: string | undefined,
  cwd: string,
): string {
  const slugFilled = entry.pathExpr.replaceAll(
    '<slug>',
    featureSlug ?? '_current',
  )
  const resolved = substituteArtifactTokens(slugFilled, ctx)
  // Release-slate / directory references → pick the most recently named match.
  if (entry.kind === 'release-slate') {
    return findLatestReleaseSlate(resolved, cwd)
  }
  return resolved
}

/**
 * Return the most recently named `v<x.y.z>.plan.md` / `v<x.y.z>.md` file
 * inside `dir`. Falls back to a sentinel path that does not exist (the
 * loader handles missing files as optional misses).
 */
function findLatestReleaseSlate(dir: string, _cwd: string): string {
  if (!existsSync(dir)) {
    return join(dir, 'v0.0.0.md')
  }
  try {
    const files = readdirSync(dir)
      .filter((f) => /^v\d+\.\d+\.\d+(?:\.plan)?\.md$/.test(String(f)))
      .sort()
      .reverse()
    if (files.length > 0) return join(dir, String(files[0]))
  } catch {
    // Best-effort
  }
  return join(dir, 'v0.0.0.md')
}

// ─── Loader (legacy loadArtifacts + new loadPhaseContext) ─────────────────────

interface LoadOpts {
  aggregateBudgetChars?: number
  perArtifactBudgets?: Partial<Record<ArtifactKind, number>>
  /**
   * When provided, use this manifest instead of `DEFAULT_PHASE_MANIFEST`.
   * Test-only override; production callers omit this argument.
   */
  manifest?: PhaseManifest
  /**
   * When `true`, emit a structured JSON line on stderr describing the
   * truncation result for observability. Defaults to `false` so unit tests
   * stay quiet; the SessionStart hook flips it on.
   */
  emitObservability?: boolean
}

/**
 * Legacy loader entry point — back-compat with the original API.
 * Internally delegates to the new `loadPhaseContext` builder.
 */
export async function loadArtifacts(
  cwd: string,
  phase: string,
  featureSlug: string | undefined,
  opts?: LoadOpts,
): Promise<ArtifactLoadResult> {
  return loadPhaseContext({
    cwd,
    phase: phase as PhaseKey,
    featureSlug,
    ...opts,
  })
}

/**
 * Phase-aware context loader. Resolves the manifest entries for `phase`,
 * reads each artefact, applies markdown-aware truncation per `maxBytes`,
 * sorts by `priority` (descending), and enforces the aggregate budget.
 *
 * Missing required artefacts emit a non-blocking warning; missing optional
 * artefacts are silently skipped. Returns an `ArtifactLoadResult`.
 */
export async function loadPhaseContext(args: {
  cwd: string
  phase: PhaseKey | string
  featureSlug: string | undefined
  aggregateBudgetChars?: number
  perArtifactBudgets?: Partial<Record<ArtifactKind, number>>
  manifest?: PhaseManifest
  emitObservability?: boolean
}): Promise<ArtifactLoadResult> {
  const {
    cwd,
    phase,
    featureSlug,
    aggregateBudgetChars = SESSION_ARTIFACT_BUDGET_CHARS,
    perArtifactBudgets,
    manifest = DEFAULT_PHASE_MANIFEST,
    emitObservability = false,
  } = args

  const phaseKey = phase as PhaseKey
  const entries = entriesForPhase(phaseKey, manifest)

  // Priority-aware ordering: highest priority first. Stable sort preserves
  // manifest-declared order within a priority band.
  const ordered = [...entries].sort((a, b) => b.priority - a.priority)

  const ctx: ArtifactPathContext = {
    anvilRoot: cwd,
    projectRoot: cwd,
    scope: 'project',
  }

  const results: LoadedArtifact[] = []
  const warnings: string[] = []
  let totalChars = 0
  let budgetHit = false
  let droppedCount = 0

  for (const entry of ordered) {
    const path = resolveEntryPath(entry, ctx, featureSlug, cwd)
    if (totalChars >= aggregateBudgetChars) {
      budgetHit = true
      droppedCount += 1
      continue
    }

    if (!existsSync(path)) {
      if (entry.required) {
        warnings.push(
          `[anvil:artifact-loader] missing required artifact (${entry.kind}): ${path}`,
        )
      }
      results.push({
        kind: entry.kind,
        path,
        content: undefined,
        truncated: false,
        missing: true,
      })
      continue
    }

    let raw: string
    try {
      raw = await readFile(path, 'utf-8')
    } catch (err) {
      if (entry.required) {
        warnings.push(
          `[anvil:artifact-loader] unreadable required artifact (${entry.kind}): ${path} — ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      results.push({
        kind: entry.kind,
        path,
        content: undefined,
        truncated: false,
        missing: true,
      })
      continue
    }

    const perBudget =
      perArtifactBudgets?.[entry.kind] ??
      entry.maxBytes ??
      ARTIFACT_BUDGETS[entry.kind]
    const remaining = aggregateBudgetChars - totalChars
    const effectiveBudget = Math.min(perBudget, remaining)

    const { text, truncated } = truncateMarkdown(raw, effectiveBudget)
    totalChars += text.length
    if (totalChars >= aggregateBudgetChars) {
      budgetHit = true
    }

    if (truncated) {
      warnings.push(
        `[anvil:artifact-loader] ${entry.kind} truncated to ${effectiveBudget} chars`,
      )
    }

    results.push({
      kind: entry.kind,
      path,
      content: text,
      truncated,
      missing: false,
    })
  }

  if (emitObservability && (budgetHit || droppedCount > 0)) {
    emitTruncationLogLine({
      ts: new Date().toISOString(),
      budgetChars: aggregateBudgetChars,
      usedChars: totalChars,
      includedCount: results.filter((r) => r.content !== undefined).length,
      droppedCount,
      phase: String(phase),
    })
  }

  return { artifacts: results, totalChars, budgetHit, warnings }
}

/**
 * Stderr-friendly structured log line for context-budget observability.
 * The dispatcher's session-start-overruns helper consumes this JSON shape
 * (see `getSessionStartOverrunLogPath`).
 */
function emitTruncationLogLine(entry: {
  ts: string
  budgetChars: number
  usedChars: number
  includedCount: number
  droppedCount: number
  phase: string
}): void {
  try {
    process.stderr.write(`${JSON.stringify(entry)}\n`)
  } catch {
    // Never throw from observability.
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Render loaded artifacts as a markdown block suitable for `systemInsert`.
 *
 * Format:
 *   ## Active artifacts [phase: implement | budget: 2048/6144 chars]
 *
 *   ### plan
 *   <content>
 *
 *   ### spec
 *   <content>
 *
 * Returns `undefined` when no artifacts were loaded (nothing to inject).
 */
export function renderArtifactBlock(
  result: ArtifactLoadResult,
  phase: string,
  aggregateBudget = SESSION_ARTIFACT_BUDGET_CHARS,
): string | undefined {
  const loaded = result.artifacts.filter((a) => a.content !== undefined)
  if (loaded.length === 0) return undefined

  const header = `## Active artifacts [phase: ${phase} | budget: ${result.totalChars}/${aggregateBudget} chars]`
  const sections = loaded.map((a) => `### ${a.kind}\n\n${a.content}`)

  const budgetNotice = result.budgetHit
    ? '\n\n> [aggregate artifact budget reached — some artifacts omitted]'
    : ''

  return `${header}\n\n${sections.join('\n\n')}${budgetNotice}`
}
