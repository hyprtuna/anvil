/**
 * ANV-0138 — Surfaces audit core library.
 *
 * Read-only dimension checks for every Anvil surface (skill, agent, command,
 * hook, rule). Five dimensions:
 *
 *   1. templates    — embedded `<!-- template-prose -->` marker without a
 *                     `templates:` frontmatter entry.
 *   2. model        — ANV-0212: skill has a registry entry (registry-coverage
 *                     check replacing the deprecated preferred_model frontmatter
 *                     check). Agents still use frontmatter `model:` / `tier:`.
 *   3. effort       — ANV-0212: skill's registry entry includes an effort value
 *                     (registry-coverage check replacing preferred_effort
 *                     frontmatter check). Haiku skills intentionally omit
 *                     effort — those are treated as pass.
 *   4. tools        — body references tool-shaped verbs ("write", "edit",
 *                     "run") but the surface's declared tools list is missing
 *                     the corresponding capability.
 *   5. invocable    — `user-invocable` is set explicitly (true|false). Helpers
 *                     that omit the field default to true but are usually
 *                     intended as helpers; this dimension flags any skill that
 *                     omits the field so authors must declare intent.
 *   6. oc_visible   — symmetric visibility for OpenCode: surfaces declared
 *                     `user-invocable: false` must also carry that signal
 *                     through the OC manifest (parity with CC). When false
 *                     and `disable-model-invocation` is missing (loose
 *                     equivalent), the row is flagged so adapters keep
 *                     parity.
 *
 * Every checker is a pure function: takes parsed frontmatter + body + slug,
 * returns `DimensionResult`. The audit script aggregates rows into a JSON
 * matrix.
 *
 * Library is intentionally framework-free — no Vitest, no Commander, no I/O
 * besides the optional `auditTree` walker (which only reads).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import matter from 'gray-matter'
import { resolveSkillAssignment } from '../registry/model-registry-index.js'

// ---------------------------------------------------------------------------
// Surface taxonomy
// ---------------------------------------------------------------------------

export type SurfaceKind = 'skill' | 'agent' | 'command' | 'hook' | 'rule'

export interface Surface {
  /** Stable name derived from frontmatter.name or filename. */
  readonly name: string
  /** Surface kind. */
  readonly kind: SurfaceKind
  /** Absolute path to the surface file. */
  readonly path: string
  /** Parsed YAML frontmatter (raw object — not zod-coerced). */
  readonly frontmatter: Readonly<Record<string, unknown>>
  /** Body text after the frontmatter fence (verbatim). */
  readonly body: string
}

// ---------------------------------------------------------------------------
// DimensionResult / AuditRow
// ---------------------------------------------------------------------------

export type DimensionStatus = 'pass' | 'flag' | 'na'

export interface DimensionResult {
  readonly status: DimensionStatus
  readonly note: string
}

export interface AuditRow {
  readonly surface: string
  readonly kind: SurfaceKind
  readonly path: string
  readonly templates: DimensionResult
  readonly model: DimensionResult
  readonly effort: DimensionResult
  readonly tools: DimensionResult
  readonly invocable: DimensionResult
  readonly oc_visible: DimensionResult
}

export interface AuditMatrix {
  readonly generated_at: string
  readonly counts: {
    readonly skill: number
    readonly agent: number
    readonly command: number
    readonly hook: number
    readonly rule: number
  }
  readonly flagged_per_dimension: {
    readonly templates: number
    readonly model: number
    readonly effort: number
    readonly tools: number
    readonly invocable: number
    readonly oc_visible: number
  }
  readonly rows: readonly AuditRow[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDED_TEMPLATE_MARKER = '<!-- template-prose -->'

const ALLOWED_EFFORT_VALUES = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

// Body verbs that imply a tool capability.  Keep narrow on purpose — only
// flag when the body talks in imperative voice about creating/changing files
// (highest signal to noise ratio).
const BODY_VERB_TO_TOOL: ReadonlyArray<{
  readonly pattern: RegExp
  readonly tool: string
}> = [
  {
    pattern: /\b(?:create|write) (?:a |the )?(?:file|plan|spec|doc)/i,
    tool: 'Write',
  },
  { pattern: /\bedit (?:the )?(?:file|line|function)/i, tool: 'Edit' },
  {
    pattern: /\brun (?:the )?(?:test|build|gate|command|script)/i,
    tool: 'Bash',
  },
  { pattern: /\bsearch (?:the )?(?:codebase|repo|repository)/i, tool: 'Grep' },
  { pattern: /\bglob /i, tool: 'Glob' },
]

// Surface kinds that take frontmatter `tools:` (or `allowed-tools:`).
const KINDS_WITH_TOOLS: ReadonlySet<SurfaceKind> = new Set([
  'skill',
  'agent',
  'command',
])

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

function fmString(
  fm: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = fm[key]
  return typeof v === 'string' ? v : undefined
}

function fmArray(
  fm: Record<string, unknown>,
  key: string,
): readonly unknown[] | undefined {
  const v = fm[key]
  return Array.isArray(v) ? v : undefined
}

function fmBoolish(
  fm: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const v = fm[key]
  return typeof v === 'boolean' ? v : undefined
}

function declaredTools(surface: Surface): readonly string[] {
  const fm = surface.frontmatter
  const tools = fmArray(fm, 'tools') ?? fmArray(fm, 'allowed-tools') ?? []
  return tools.filter((t): t is string => typeof t === 'string')
}

// ---------------------------------------------------------------------------
// Dimension: templates
// ---------------------------------------------------------------------------

/**
 * Flag a surface that contains the `<!-- template-prose -->` marker without a
 * `templates:` frontmatter entry. Mirrors `pushTemplateEmbeddedLintCheck`.
 */
export function checkTemplates(surface: Surface): DimensionResult {
  if (!surface.body.includes(EMBEDDED_TEMPLATE_MARKER)) {
    return { status: 'pass', note: 'no embedded-template marker' }
  }
  const templatesField = surface.frontmatter.templates
  if (templatesField !== undefined) {
    return { status: 'pass', note: 'marker + templates: field present' }
  }
  return {
    status: 'flag',
    note: 'body has <!-- template-prose --> but no `templates:` frontmatter entry',
  }
}

// ---------------------------------------------------------------------------
// Dimension: model
// ---------------------------------------------------------------------------

/**
 * Flag a surface that has no model assignment.
 *
 * - Skills: ANV-0212 registry-coverage check. A skill must have an entry in
 *   the bundled skill registry (`resolveSkillAssignment` returns non-undefined).
 *   The deprecated `preferred_model:` frontmatter field is no longer the
 *   signal — ANV-0214 will delete it. New skills need only be added to a
 *   defaults.ts group (or override) to get a registry entry.
 * - Agents use `model:` (defaulted to 'inherit' by AgentFrontmatter).
 * - Commands & hooks may omit the field; the dimension is `na` for them.
 */
export function checkModel(surface: Surface): DimensionResult {
  if (surface.kind === 'skill') {
    const assignment = resolveSkillAssignment(surface.name)
    if (!assignment) {
      return {
        status: 'flag',
        note: `skill '${surface.name}' has no registry entry — add to a defaults.ts group or override`,
      }
    }
    return { status: 'pass', note: `registry model=${assignment.model}` }
  }
  if (surface.kind === 'agent') {
    // Agents may declare model explicitly OR rely on `tier:` (which maps
    // to a model+effort pair via the tier resolver). Either signal counts.
    const m = fmString(surface.frontmatter, 'model')
    const tier = fmString(surface.frontmatter, 'tier')
    if (m) return { status: 'pass', note: `model=${m}` }
    if (tier) return { status: 'pass', note: `tier=${tier}` }
    return {
      status: 'flag',
      note: 'agent declares neither `model:` nor `tier:`',
    }
  }
  return {
    status: 'na',
    note: `${surface.kind} surfaces don't declare a model`,
  }
}

// ---------------------------------------------------------------------------
// Dimension: effort
// ---------------------------------------------------------------------------

/**
 * Flag a surface that has no effort assignment.
 *
 * - Skills: ANV-0212 registry-coverage check. Reads effort from the
 *   bundled registry (`resolveSkillAssignment`). Haiku skills intentionally
 *   omit the effort field (the resolver drops it for small-role models) —
 *   those are treated as pass with a note. Skills missing a registry entry
 *   entirely are flagged by `checkModel`; here we return `na` to avoid
 *   double-flagging.
 * - Agents may declare `effort:` (optional).
 * - Commands & hooks: na.
 */
export function checkEffort(surface: Surface): DimensionResult {
  if (surface.kind === 'skill') {
    const assignment = resolveSkillAssignment(surface.name)
    if (!assignment) {
      // checkModel already flags missing registry entries; avoid double-flag.
      return {
        status: 'na',
        note: `skill '${surface.name}' has no registry entry (flagged by model dimension)`,
      }
    }
    if (assignment.effort === undefined) {
      // Haiku-class skills: effort intentionally absent (resolver drops it for small role).
      return {
        status: 'pass',
        note: `registry model=${assignment.model} (effort omitted — Haiku class)`,
      }
    }
    return { status: 'pass', note: `registry effort=${assignment.effort}` }
  }
  if (surface.kind === 'agent') {
    const v = fmString(surface.frontmatter, 'effort')
    // Optional on agents; only flag if declared with a bad value.
    if (v !== undefined && !ALLOWED_EFFORT_VALUES.has(v)) {
      return {
        status: 'flag',
        note: `effort=${v} (not in enum)`,
      }
    }
    return {
      status: 'pass',
      note: v ? `effort=${v}` : 'no effort declared (optional)',
    }
  }
  return { status: 'na', note: `${surface.kind} surfaces don't declare effort` }
}

// ---------------------------------------------------------------------------
// Dimension: tools
// ---------------------------------------------------------------------------

/**
 * Flag a surface whose body imperatively uses a tool verb (write, edit,
 * run, search) without declaring the matching tool in `tools:` /
 * `allowed-tools:`.
 *
 * Conservative: only flags imperative imperatives in narrow phrasing
 * (`create a file`, `edit the file`, `run the test`).
 */
export function checkTools(surface: Surface): DimensionResult {
  if (!KINDS_WITH_TOOLS.has(surface.kind)) {
    return {
      status: 'na',
      note: `${surface.kind} surfaces don't declare tools`,
    }
  }
  // TypeScript surfaces (CLI commands) carry their tool-access intent in code,
  // not frontmatter. The static body-verb check is not meaningful for them.
  if (surface.path.endsWith('.ts')) {
    return { status: 'na', note: 'TS surface — tool access is code-driven' }
  }
  const declared = new Set(declaredTools(surface))
  const missing: string[] = []
  for (const { pattern, tool } of BODY_VERB_TO_TOOL) {
    if (pattern.test(surface.body) && !declared.has(tool)) {
      if (!missing.includes(tool)) missing.push(tool)
    }
  }
  if (missing.length === 0) {
    return {
      status: 'pass',
      note:
        declared.size > 0
          ? `tools=[${[...declared].join(',')}] match body verbs`
          : 'no body verb implies a missing tool',
    }
  }
  return {
    status: 'flag',
    note: `body references tool verb(s) but declared tools omit: ${missing.join(', ')}`,
  }
}

// ---------------------------------------------------------------------------
// Dimension: invocable
// ---------------------------------------------------------------------------

/**
 * For skills: the schema defaults `user-invocable` to true. CLAUDE.md says
 * the ~15 canonical user-invocable skills should leave the field at its
 * default. Helpers (sub-directories: rules/, ui/, workflows/, languages/
 * overlays) MUST explicitly declare `user-invocable: false`.
 *
 * Flag: a skill living in a helper subdirectory whose effective
 * `user-invocable` is true (i.e., declared true OR omitted).
 *
 * For agents/commands/hooks/rules: na (rule subdir is captured by the
 * `rule` kind, see below).
 */
const HELPER_SUBDIRS = ['/rules/', '/ui/', '/workflows/']

function looksLikeHelperPath(path: string): boolean {
  if (path.includes('/skills/languages/')) return true
  for (const seg of HELPER_SUBDIRS) {
    if (path.includes(seg)) return true
  }
  return false
}

export function checkInvocable(surface: Surface): DimensionResult {
  if (surface.kind === 'rule') {
    const v = fmBoolish(surface.frontmatter, 'user-invocable')
    if (v !== false) {
      return {
        status: 'flag',
        note: 'rule overlay should declare `user-invocable: false`',
      }
    }
    return { status: 'pass', note: 'user-invocable=false (rule)' }
  }
  if (surface.kind !== 'skill') {
    return {
      status: 'na',
      note: `${surface.kind} surfaces don't carry user-invocable`,
    }
  }
  const v = fmBoolish(surface.frontmatter, 'user-invocable')
  const effective = v ?? true
  if (looksLikeHelperPath(surface.path)) {
    if (effective !== false) {
      return {
        status: 'flag',
        note: 'helper-path skill should declare `user-invocable: false` explicitly',
      }
    }
    return { status: 'pass', note: 'helper marked user-invocable=false' }
  }
  // Top-level skill — declared either way is fine; default (true) is the
  // documented convention for the canonical entry points.
  return {
    status: 'pass',
    note: `user-invocable=${effective}${v === undefined ? ' (default)' : ''}`,
  }
}

// ---------------------------------------------------------------------------
// Dimension: oc_visible
// ---------------------------------------------------------------------------

/**
 * Symmetric OpenCode visibility check.
 *
 * The ticket flags that helpers (`user-invocable: false`) should be hidden in
 * OpenCode's plugin manifest the same way they are in Claude Code. Until the
 * adapter respects the flag end-to-end, we flag any skill that declares
 * `user-invocable: false` but lacks the loose-equivalent
 * `disable-model-invocation: true` (the OpenCode-friendly signal that hides
 * the skill from auto-routing menus).
 *
 * For agents/commands/hooks/rules: na.
 */
export function checkOcVisible(surface: Surface): DimensionResult {
  if (surface.kind !== 'skill') {
    return { status: 'na', note: 'OC visibility check only applies to skills' }
  }
  const invocable = fmBoolish(surface.frontmatter, 'user-invocable')
  if (invocable !== false) {
    return {
      status: 'pass',
      note: 'skill is user-invocable; OC visibility expected',
    }
  }
  const disableModel = fmBoolish(
    surface.frontmatter,
    'disable-model-invocation',
  )
  if (disableModel === true) {
    return {
      status: 'pass',
      note: 'user-invocable=false + disable-model-invocation=true; OC parity ok',
    }
  }
  return {
    status: 'flag',
    note: 'user-invocable=false but `disable-model-invocation:` missing — OC may still expose this skill',
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function auditSurface(surface: Surface): AuditRow {
  return {
    surface: surface.name,
    kind: surface.kind,
    path: surface.path,
    templates: checkTemplates(surface),
    model: checkModel(surface),
    effort: checkEffort(surface),
    tools: checkTools(surface),
    invocable: checkInvocable(surface),
    oc_visible: checkOcVisible(surface),
  }
}

export function isRowFlagged(row: AuditRow): boolean {
  return (
    row.templates.status === 'flag' ||
    row.model.status === 'flag' ||
    row.effort.status === 'flag' ||
    row.tools.status === 'flag' ||
    row.invocable.status === 'flag' ||
    row.oc_visible.status === 'flag'
  )
}

export function aggregateMatrix(rows: readonly AuditRow[]): AuditMatrix {
  const counts = { skill: 0, agent: 0, command: 0, hook: 0, rule: 0 }
  const flagged = {
    templates: 0,
    model: 0,
    effort: 0,
    tools: 0,
    invocable: 0,
    oc_visible: 0,
  }
  for (const row of rows) {
    counts[row.kind] += 1
    if (row.templates.status === 'flag') flagged.templates += 1
    if (row.model.status === 'flag') flagged.model += 1
    if (row.effort.status === 'flag') flagged.effort += 1
    if (row.tools.status === 'flag') flagged.tools += 1
    if (row.invocable.status === 'flag') flagged.invocable += 1
    if (row.oc_visible.status === 'flag') flagged.oc_visible += 1
  }
  return {
    generated_at: new Date().toISOString(),
    counts,
    flagged_per_dimension: flagged,
    rows,
  }
}

// ---------------------------------------------------------------------------
// File system walker
// ---------------------------------------------------------------------------

function walkMd(root: string): string[] {
  const out: string[] = []
  if (!existsSync(root)) return out
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (
        name === 'CLAUDE.md' ||
        name === 'AGENTS.md' ||
        name === 'README.md'
      ) {
        continue
      }
      // ANV-0179 — `*-prompt.md` files are ANV-0083 collapsed-agent prompt
      // fragments invoked via `Task(general-purpose)`, NOT skills. The skill
      // loader silently skips them (subdir-form short-circuit only loads
      // SKILL.md); the audit walker honors the same convention so dimension
      // drift doesn't double-count prompt fragments.
      if (name.endsWith('-prompt.md')) continue
      const full = join(dir, name)
      let stat: { isDirectory(): boolean; isFile(): boolean }
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        stack.push(full)
        continue
      }
      if (stat.isFile() && extname(full) === '.md') {
        out.push(full)
      }
    }
  }
  return out.sort()
}

function walkTs(root: string): string[] {
  const out: string[] = []
  if (!existsSync(root)) return out
  let names: string[] = []
  try {
    names = readdirSync(root)
  } catch {
    return out
  }
  for (const name of names) {
    if (name.startsWith('.') || name.startsWith('_')) continue
    const full = join(root, name)
    let stat: { isDirectory(): boolean; isFile(): boolean }
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isFile() && extname(full) === '.ts') {
      out.push(full)
    }
  }
  return out.sort()
}

function parseSurfaceFile(path: string, kind: SurfaceKind): Surface | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    return null
  }
  if (extname(path) === '.ts') {
    // For TypeScript surfaces (hook handlers + CLI commands), we have no
    // frontmatter. Synthesize an empty fm and use the filename as the slug.
    const base = path.split('/').pop() ?? path
    const name = base.replace(/\.ts$/, '')
    return {
      name,
      kind,
      path,
      frontmatter: {},
      body: raw,
    }
  }
  // Markdown surfaces: parse YAML frontmatter.
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    return null
  }
  const fm = parsed.data as Record<string, unknown>
  const base = path.split('/').pop() ?? path
  const name =
    (typeof fm.name === 'string' && fm.name) || base.replace(/\.md$/, '')
  return {
    name,
    kind,
    path,
    frontmatter: fm,
    body: parsed.content,
  }
}

export interface AuditTreeOptions {
  /** Absolute path to the repository root. */
  readonly cwd: string
}

/**
 * Walk every surface tree under `cwd` and return the audit matrix. Pure
 * read-only — never writes to disk.
 */
export function auditTree(opts: AuditTreeOptions): AuditMatrix {
  const { cwd } = opts
  const surfaces: Surface[] = []

  for (const path of walkMd(join(cwd, 'skills'))) {
    const s = parseSurfaceFile(path, 'skill')
    if (s) surfaces.push(s)
  }
  for (const path of walkMd(join(cwd, 'agents'))) {
    const s = parseSurfaceFile(path, 'agent')
    if (s) surfaces.push(s)
  }
  // Slash commands (.md with frontmatter)
  for (const path of walkMd(join(cwd, 'src', 'commands', 'slash'))) {
    const s = parseSurfaceFile(path, 'command')
    if (s) surfaces.push(s)
  }
  // CLI commands (.ts)
  for (const path of walkTs(join(cwd, 'src', 'commands', 'cli'))) {
    const s = parseSurfaceFile(path, 'command')
    if (s) surfaces.push(s)
  }
  // Hook handlers (.ts)
  for (const path of walkTs(join(cwd, 'src', 'hooks', 'handlers'))) {
    const s = parseSurfaceFile(path, 'hook')
    if (s) surfaces.push(s)
  }
  // Rules (skill content under skills/universal/rules/)
  // Already picked up by walkMd(join(cwd, 'skills')) above; mark them by
  // re-classifying paths under universal/rules/ as `rule`.
  const reclassified: Surface[] = surfaces.map((s) => {
    if (
      s.kind === 'skill' &&
      (s.path.includes('/skills/universal/rules/') ||
        (s.path.includes('/skills/languages/') && s.path.includes('/rules/')))
    ) {
      return { ...s, kind: 'rule' as const }
    }
    return s
  })

  const rows = reclassified.map(auditSurface)
  return aggregateMatrix(rows)
}
