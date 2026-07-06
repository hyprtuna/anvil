/**
 * ANV-0019 — Context-manifest doctor check.
 *
 * Asserts that every artefact reference in the declarative phase manifest
 * (`src/core/context/phase-manifest.ts`) resolves cleanly via the ANV-0134
 * token vocabulary. A token typo (e.g. `${ANVIL_PLAN_DIR}` instead of
 * `${ANVIL_PLANS_DIR}`) or a refactor that drops a token from the
 * `ARTIFACT_TOKENS` list will surface here on the next `anvil doctor` run.
 *
 * Severity: fail. A broken manifest entry means SessionStart silently fails
 * to inject the artefact — the contract is hard.
 */
import {
  ARTIFACT_TOKENS,
  resolveArtifactPath,
} from '../../../core/artifact-paths.js'
import {
  DEFAULT_PHASE_MANIFEST,
  referencedTokens,
} from '../../../core/context/phase-manifest.js'

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * Verify that every token used by `DEFAULT_PHASE_MANIFEST` is in the
 * canonical `ARTIFACT_TOKENS` list and resolves under the project scope.
 *
 * `cwd` is only used to seed the `ArtifactPathContext`; the resolver is
 * pure and doesn't touch disk, so the row is fast and side-effect free.
 *
 * Exported so unit tests can exercise the row in isolation.
 */
export function pushContextManifestArtifactsCheck(
  checks: Check[],
  cwd: string,
): void {
  const tokens = referencedTokens(DEFAULT_PHASE_MANIFEST)
  const unknown: string[] = []
  const unresolved: string[] = []
  for (const t of tokens) {
    if (!(ARTIFACT_TOKENS as readonly string[]).includes(t)) {
      unknown.push(t)
      continue
    }
    try {
      resolveArtifactPath(t, {
        anvilRoot: cwd,
        projectRoot: cwd,
        scope: 'project',
      })
    } catch (err) {
      unresolved.push(
        `${t} (${err instanceof Error ? err.message : String(err)})`,
      )
    }
  }
  if (unknown.length === 0 && unresolved.length === 0) {
    checks.push({
      name: 'phase-manifest artifacts resolve',
      status: 'pass',
      detail: `${tokens.length} token(s) referenced by phase-manifest; all resolve`,
    })
    return
  }
  const parts: string[] = []
  if (unknown.length > 0) parts.push(`unknown tokens: ${unknown.join(', ')}`)
  if (unresolved.length > 0) {
    parts.push(`unresolved: ${unresolved.join('; ')}`)
  }
  checks.push({
    name: 'phase-manifest artifacts resolve',
    status: 'fail',
    detail: parts.join(' | '),
  })
}
