import {
  type ArtifactPathContext,
  substituteArtifactTokens,
} from '../core/artifact-paths.js'
import type { RuntimeContext } from '../core/runtime/context.js'
import {
  type TemplateResolutionContext,
  findTemplateRefs,
  substituteTemplateRefs,
} from '../core/templates/index.js'
import type { Skill } from '../core/types.js'
import { SkillBodyMissingError } from './errors.js'

/**
 * Memoisation counter — incremented each time a lazy-loaded body is fetched
 * from disk. Read by `anvil doctor` to show "n/total bodies fetched".
 * Reset to 0 on process start; not persisted.
 */
let _bodyFetchCount = 0

/**
 * Returns the current count of lazy body-fetches performed in this process.
 * Used by the doctor command to display "lazy (n/total bodies fetched)".
 */
export function getBodyFetchCount(): number {
  return _bodyFetchCount
}

/**
 * Resets the body-fetch counter. Exposed for unit-test isolation only.
 */
export function resetBodyFetchCount(): void {
  _bodyFetchCount = 0
}

/**
 * Returns the markdown body for a skill, fetching it on first call when
 * operating in lazy mode (Plan 32 B2).
 *
 * - If `skill.body` is already set (eager mode or previously memoised), returns it directly.
 * - If `skill.bodyLoader` is set (lazy mode), invokes the loader, memoises the result
 *   into `skill.body`, increments the fetch counter, and returns the body.
 * - If neither is set, throws `SkillBodyMissingError`.
 */
export async function getSkillBody(skill: Skill): Promise<string> {
  if (skill.body !== undefined) {
    return skill.body
  }
  if (skill.bodyLoader !== undefined) {
    // The bodyLoader type from Zod is z.function() which resolves to
    // (...args: unknown[]) => unknown. We know the closure returns Promise<string>.
    const loaded = await (skill.bodyLoader as () => Promise<string>)()
    // Memoise: mutate the skill object so subsequent calls skip the loader.
    ;(skill as { body?: string }).body = loaded
    _bodyFetchCount++
    return loaded
  }
  throw new SkillBodyMissingError(skill.frontmatter.name)
}

/**
 * Returns the skill body with substitutions applied in this order:
 *
 *   1. `${TEMPLATE:<kind>}` references (ANV-0137) — spliced in from the
 *      `templates/<kind>/<variant>.md` directory; user overrides win over
 *      bundled. Run *first* so the spliced template content is itself
 *      subject to step 2.
 *   2. `${ANVIL_*}` artefact-path tokens (ANV-0134) — rewritten to absolute
 *      paths under the active scope root.
 *
 * Use this at render time — when handing the body to a model, piping to
 * stdout for an agent prompt, or otherwise materialising the prose. Source
 * `.md` files stay portable: they reference tokens and template kinds, not
 * literal paths or embedded prose. If a future release relocates `.anvil/plans/`
 * or restructures a template, callers of this function pick up the new
 * layout automatically without a skill-corpus sweep.
 *
 * Substitution is **lenient** at every stage:
 *
 *   - Unknown `${TEMPLATE:foo}` references pass through unmodified.
 *   - Unknown `${ANVIL_*}` tokens pass through unmodified.
 *
 * The doctor surfaces drift via separate linter rows: it warns when a body
 * contains the `<!-- template-prose -->` marker without a corresponding
 * `templates:` frontmatter entry, and when a skill references a template
 * kind that has no bundled file.
 *
 * Back-compat with ANV-0134: callers that supply an `ArtifactPathContext`
 * only (no `surface`, no `userRoot`) still get the artefact-token
 * substitution they relied on before; the templates pass becomes a no-op
 * for bodies that contain no `${TEMPLATE:…}` references.
 */
/**
 * ANV-0176 — context the renderer needs in addition to artefact paths and
 * template resolution. Carries the session-scoped `RuntimeContext` so the
 * renderer can append an auto-mode banner when the body references the
 * `decisions` template and the operator has opted into auto-mode.
 */
export type RenderSkillBodyContext = ArtifactPathContext &
  Partial<TemplateResolutionContext> & {
    /** Session runtime knobs (autoMode + acceptDefaults). Optional for back-compat. */
    runtimeContext?: RuntimeContext
  }

export async function renderSkillBody(
  skill: Skill,
  ctx: RenderSkillBodyContext,
): Promise<string> {
  const raw = await getSkillBody(skill)
  // Step 1: templates. Build a TemplateResolutionContext from the ArtifactPathContext —
  // `anvilRoot` is shared; `userRoot` and `surface` are optional and additive.
  const templateCtx: TemplateResolutionContext = {
    anvilRoot: ctx.anvilRoot,
    userRoot: ctx.userRoot,
    surface: ctx.surface,
  }
  const withTemplates = substituteTemplateRefs(raw, templateCtx)
  // Step 2: artefact-path tokens. Runs after templates so spliced-in prose
  // can itself reference `${ANVIL_PLANS_DIR}` etc.
  const withTokens = substituteArtifactTokens(withTemplates, ctx)
  // Step 3 (ANV-0176): when the body references the `decisions` template AND
  // the operator has opted into auto-mode (or accept-defaults), append a
  // banner so the agent knows it may auto-select high-confidence decisions.
  // The banner is a stable, greppable marker; downstream tooling (and the
  // agent itself) consult `resolveDecisionAutoMode` for the actual policy
  // decision. The marker is intentionally additive and only renders when the
  // body actually references decisions.
  return appendAutoModeBanner(withTokens, ctx.runtimeContext, raw)
}

/**
 * ANV-0176 — appends a one-line auto-mode banner to `body` when:
 *
 *   - `runtimeContext` is present, and
 *   - `runtimeContext.autoMode` or `runtimeContext.acceptDefaults` is true, and
 *   - the original (pre-substitution) body references the `decisions`
 *     template via `${TEMPLATE:decisions}`.
 *
 * The banner gives the agent a stable signal that auto-mode is active so it
 * can call `resolveDecisionAutoMode` + `writeDecisionAuditEntry` when it
 * constructs a DecisionPrompt at run time. Pure — does not mutate inputs.
 */
function appendAutoModeBanner(
  body: string,
  runtimeContext: RuntimeContext | undefined,
  rawBody: string,
): string {
  if (runtimeContext === undefined) return body
  if (!runtimeContext.autoMode && !runtimeContext.acceptDefaults) return body
  // Only annotate skills whose body actually references decisions.
  const kinds = findTemplateRefs(rawBody)
  if (!kinds.includes('decisions')) return body
  const flags: string[] = []
  if (runtimeContext.autoMode) flags.push('autoMode=on')
  if (runtimeContext.acceptDefaults) flags.push('acceptDefaults=on')
  const banner = `\n\n<!-- anv-0176 -->\n**Auto-mode active (${flags.join(', ')}).** When you construct a \`DecisionPrompt\`, route it through \`resolveDecisionAutoMode\` + \`writeDecisionAuditEntry\` before emitting it to the user.\n`
  return body + banner
}
