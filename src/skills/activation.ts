/**
 * ANV-0122 — declarative activation pre-filter for skills.
 *
 * Skills may declare an optional `activation:` block in their frontmatter
 * with three sub-fields (all optional):
 *
 *   activation:
 *     globs:     [string]   — at least one file matching any glob must
 *                              exist somewhere in the current project tree.
 *     languages: [string]   — the project context must report at least
 *                              one matching language.
 *     events:    [string]   — hook events the skill may fire on
 *                              (informational for now; not yet enforced
 *                              by the dispatcher).
 *
 * When *any* declared sub-field cannot be satisfied by the current context
 * the skill is filtered out before routing.  Skills WITHOUT an activation
 * block are always retained (back-compat).
 *
 * The filter is intentionally permissive on missing context: if the caller
 * does not pass a particular dimension (e.g. omits `projectFiles`), the
 * globs sub-check is treated as "cannot evaluate -> retain".  This avoids
 * dropping skills in environments where project detection is partial.
 *
 * Pure module — no I/O — testable from fixtures.
 */
import type { ActivationBlock, Skill } from '../core/types.js'

export interface ActivationContext {
  /** Lowercased language names detected for the project (`['typescript']`). */
  languages?: ReadonlyArray<string>
  /**
   * Relative POSIX paths of files in the project.  Optional — when absent
   * the glob check is skipped (treated as "satisfiable").
   */
  projectFiles?: ReadonlyArray<string>
  /**
   * Hook event names the runtime currently supports.  Optional — when
   * absent the events check is skipped (treated as "satisfiable").
   */
  availableEvents?: ReadonlyArray<string>
}

export interface ActivationFilterResult {
  /** Skills that pass the activation gate. */
  kept: Skill[]
  /**
   * Skills that were excluded by the gate, paired with the reason.  Useful
   * for the routing trace and the doctor row.
   */
  excluded: ReadonlyArray<{ skill: Skill; reason: string }>
}

/**
 * Public entry-point.  Returns the filtered registry along with the
 * exclusion list.  Always retains skills without an `activation` block.
 */
export function filterSkillsByActivation(
  skills: ReadonlyArray<Skill>,
  ctx: ActivationContext,
): ActivationFilterResult {
  const kept: Skill[] = []
  const excluded: { skill: Skill; reason: string }[] = []
  for (const skill of skills) {
    const block = skill.frontmatter.activation
    if (!block) {
      kept.push(skill)
      continue
    }
    const verdict = evaluateActivation(block, ctx)
    if (verdict.activates) {
      kept.push(skill)
    } else {
      excluded.push({ skill, reason: verdict.reason })
    }
  }
  return { kept, excluded }
}

/**
 * Evaluate a single activation block against the context.  Returns
 * `{ activates: true }` when every declared sub-field is either absent or
 * satisfiable; otherwise returns a human-readable reason.
 */
export function evaluateActivation(
  block: ActivationBlock,
  ctx: ActivationContext,
): { activates: true } | { activates: false; reason: string } {
  // Languages: if declared AND the context reports a non-empty language
  // list, require at least one match.  When the context does NOT report
  // languages, we cannot disprove the skill -> retain.
  if (
    block.languages &&
    block.languages.length > 0 &&
    ctx.languages &&
    ctx.languages.length > 0
  ) {
    const declared = new Set(block.languages.map((l) => l.toLowerCase()))
    const detected = new Set(ctx.languages.map((l) => l.toLowerCase()))
    let hit = false
    for (const d of declared) {
      if (detected.has(d)) {
        hit = true
        break
      }
    }
    if (!hit) {
      return {
        activates: false,
        reason: `languages [${[...declared].join(', ')}] not in detected [${[...detected].join(', ')}]`,
      }
    }
  }

  // Globs: only enforce when we have a project-file list to compare against.
  if (
    block.globs &&
    block.globs.length > 0 &&
    ctx.projectFiles &&
    ctx.projectFiles.length > 0
  ) {
    const anyMatch = block.globs.some((glob) =>
      ctx.projectFiles!.some((f) => globMatch(glob, f)),
    )
    if (!anyMatch) {
      return {
        activates: false,
        reason: `no project file matches globs [${block.globs.join(', ')}]`,
      }
    }
  }

  // Events: enforce only when we have an availableEvents list.
  if (
    block.events &&
    block.events.length > 0 &&
    ctx.availableEvents &&
    ctx.availableEvents.length > 0
  ) {
    const avail = new Set(ctx.availableEvents)
    const hit = block.events.some((e) => avail.has(e))
    if (!hit) {
      return {
        activates: false,
        reason: `events [${block.events.join(', ')}] not in available [${[...avail].join(', ')}]`,
      }
    }
  }

  return { activates: true }
}

/**
 * Minimal glob matcher — enough for the patterns activation blocks declare
 * (e.g. `**\/*.tsx`, `src/components/**`, `*.md`).  Not a full minimatch
 * replacement; ANV-0122 explicitly avoids adding a dep here.
 *
 * Supported:
 *   `**`  — any number of path segments (or none)
 *   `*`   — any character except `/`
 *   `?`   — any single character except `/`
 *
 * Anything else is escaped and matched literally.
 */
export function globMatch(glob: string, path: string): boolean {
  const re = globToRegex(glob)
  return re.test(path)
}

function globToRegex(glob: string): RegExp {
  let out = '^'
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` — match any sequence (including `/`).  Consume optional
        // trailing slash so `src/**` matches `src/foo` (not just `src/`).
        out += '.*'
        i += 2
        if (glob[i] === '/') i += 1
        continue
      }
      out += '[^/]*'
      i += 1
      continue
    }
    if (c === '?') {
      out += '[^/]'
      i += 1
      continue
    }
    // Escape regex metas
    if (/[.+^$|()[\]{}\\]/.test(c)) {
      out += `\\${c}`
    } else {
      out += c
    }
    i += 1
  }
  out += '$'
  return new RegExp(out)
}

/**
 * Count skills that declare an activation block.  Used by the doctor row
 * "activation: N skills use activation-block (gradual adoption)".
 */
export function countSkillsWithActivation(
  skills: ReadonlyArray<Skill>,
): number {
  let n = 0
  for (const s of skills) {
    if (s.frontmatter.activation) n += 1
  }
  return n
}
