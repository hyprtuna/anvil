import { existsSync } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { table } from 'table'
import { loadConfig, saveConfig } from '../../core/config/load.js'
import { getUserHome } from '../../core/io/home.js'
import { resolveModel } from '../../core/models/resolve.js'
import { parsePackSlug } from '../../core/pack/index.js'
import { addPin, loadPins, removePin } from '../../core/pins/store.js'
import { detectProject } from '../../core/project/detect.js'
import { getSkillBody, renderSkillBody } from '../../skills/body.js'
import { loadAllSkills } from '../../skills/load-all.js'
import { loadSkillFile } from '../../skills/loader.js'
import { selectSkills } from '../../skills/selector.js'
import { maybeEmitJson } from './common/json-mode.js'
import type { CliOptions } from './common/json-mode.js'
import { effortColor, modelColor } from './common/output.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ANVIL_ROOT = join(__dirname, '..', '..', '..')
const SKILLS_ROOT = join(ANVIL_ROOT, 'skills')

/**
 * Build the context the artefact-path resolver (ANV-0134) and the templates
 * resolver (ANV-0137) need for rendering skill bodies to stdout. Skills
 * shipped with Anvil reference the current project's `.anvil/` tree, so
 * `projectRoot` is the caller's cwd. The `userRoot` defaults to
 * `~/.anvil` so user-template overrides (ANV-0137) are picked up
 * automatically.
 */
function renderContext(): {
  anvilRoot: string
  projectRoot: string
  scope: 'project'
  userRoot: string
} {
  return {
    anvilRoot: ANVIL_ROOT,
    projectRoot: process.cwd(),
    scope: 'project',
    userRoot: join(getUserHome(), '.anvil'),
  }
}

export interface SkillListOptions extends CliOptions {
  language?: string
  group?: string
  all?: boolean
  /** Include user-invocable:false (hidden) skills in the listing. */
  includeHidden?: boolean
  /** Plan 44 Phase C — show Source / Conf columns in the text table. */
  verbose?: boolean
  /**
   * ANV-0096 — filter to skills belonging to a specific pack. `'anvil'` is the
   * reserved sentinel for bundled skills; any other value filters to the
   * installed pack of that name. Unknown packs produce an empty listing
   * rather than an error.
   */
  pack?: string
}

export async function skillListCommand(opts: SkillListOptions): Promise<void> {
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })

  let skills = registry.getAll()
  // `--all` is legacy (kept for compat); `--include-hidden` is the new name.
  // Either flag shows the full set.
  const showAll = opts.all === true || opts.includeHidden === true
  if (!showAll) {
    skills = skills.filter((s) => s.frontmatter.userInvocable !== false)
  }
  if (opts.language)
    skills = skills.filter((s) => s.frontmatter.language === opts.language)
  if (opts.group)
    skills = skills.filter((s) => s.frontmatter.group === opts.group)
  // ANV-0096 — `--pack` filter. Today only the bundled namespace (`anvil`) is
  // populated by the in-memory registry; named third-party packs surface
  // when ANV-0203's install UX lands. An unknown pack name yields zero rows
  // by design — the user gets explicit feedback that nothing is installed
  // under that name.
  if (opts.pack !== undefined) {
    if (opts.pack === 'anvil') {
      skills = skills.filter((s) => s.scope === 'bundled')
    } else {
      skills = []
    }
  }

  const rows = skills.map((s) => {
    const r = resolveModel(s.frontmatter.name, config, { env: process.env })
    return {
      name: s.frontmatter.name,
      group: s.frontmatter.group,
      language: s.frontmatter.language,
      tier: s.tier,
      tools: s.frontmatter.tools,
      resolvedModel: r,
      // Plan 44 Phase C — provenance triple (always emitted in JSON mode).
      source: s.frontmatter.sourceProvenance,
      confidence: s.frontmatter.provenanceConfidence,
      created_at: s.frontmatter.createdAt,
    }
  })

  // ANV-0090 — Surface pinned skills in a separate "Pinned" section at the
  // top of the slash-menu listing. Pins live in `~/.anvil/pins.json`; missing
  // file → empty list (silently). Pins survive `--language` / `--group`
  // filters so users always see their shortcuts.
  let pinnedSlugs: string[] = []
  try {
    pinnedSlugs = await loadPins()
  } catch {
    // Malformed pins.json: silently treat as empty in `list` so the menu
    // still renders. `anvil doctor` surfaces the parse failure separately.
    pinnedSlugs = []
  }
  const pinnedRows = pinnedSlugs
    .map((slug) => {
      const s = registry.get(slug)
      if (!s) return null
      const r = resolveModel(s.frontmatter.name, config, { env: process.env })
      return {
        name: s.frontmatter.name,
        group: s.frontmatter.group,
        language: s.frontmatter.language,
        tier: s.tier,
        tools: s.frontmatter.tools,
        resolvedModel: r,
        source: s.frontmatter.sourceProvenance,
        confidence: s.frontmatter.provenanceConfidence,
        created_at: s.frontmatter.createdAt,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // JSON output remains a top-level array of skills for back-compat;
  // pin status is exposed via the `pinned` boolean on each row so callers
  // can render their own Pinned section without a shape change.
  if (opts.json) {
    const pinnedSet = new Set(pinnedSlugs)
    const annotated = rows.map((r) => ({ ...r, pinned: pinnedSet.has(r.name) }))
    if (maybeEmitJson(annotated, opts)) return
  }

  const headers = ['Skill', 'Group', 'Lang', 'Model', 'Effort', 'Tier']
  if (opts.verbose) headers.push('Source', 'Conf')
  const formatRow = (r: (typeof rows)[number]): string[] => {
    const cells: string[] = [
      r.name,
      r.group ?? '',
      r.language ?? '',
      chalk[modelColor(r.resolvedModel.model)](r.resolvedModel.model),
      chalk[effortColor(r.resolvedModel.effort)](r.resolvedModel.effort),
      r.tier,
    ]
    if (opts.verbose) {
      cells.push(r.source ?? 'unknown')
      cells.push(r.confidence !== undefined ? r.confidence.toFixed(2) : '—')
    }
    return cells
  }

  if (pinnedRows.length > 0) {
    process.stdout.write(chalk.bold('Pinned\n'))
    process.stdout.write(table([headers, ...pinnedRows.map(formatRow)]))
    process.stdout.write(chalk.bold('All skills\n'))
  }
  process.stdout.write(table([headers, ...rows.map(formatRow)]))
}

export async function skillValidateCommand(name: string): Promise<void> {
  const candidates = [
    join(SKILLS_ROOT, 'universal', `${name}.md`),
    ...(await findInLanguages(name)),
  ]
  const path = candidates.find((p) => existsSync(p))
  if (!path) throw new Error(`skill not found: ${name}`)

  const tier: 'universal' | 'language' = path.includes('/languages/')
    ? 'language'
    : 'universal'
  const skill = await loadSkillFile(path, tier, { warnOnInvalid: false })
  if (!skill) throw new Error(`skill "${name}" has invalid frontmatter`)
  const body = await getSkillBody(skill)
  process.stdout.write(
    chalk.green(`✓ ${name}: frontmatter valid; body ${body.length} chars\n`),
  )
}

async function findInLanguages(name: string): Promise<string[]> {
  const langDir = join(SKILLS_ROOT, 'languages')
  if (!existsSync(langDir)) return []
  const langs = await readdir(langDir)
  return langs.map((l) => join(langDir, l, `${name}.md`))
}

export async function skillEnableCommand(name: string): Promise<void> {
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  config.disabled.skills = config.disabled.skills.filter((s) => s !== name)
  await saveConfig(config, { scope: 'project', cwd: process.cwd() })
  process.stdout.write(chalk.green(`✓ enabled: ${name}\n`))
}

/**
 * ANV-0090 — `anvil skill pin <slug>`. Adds a skill slug to the per-user
 * pin list (`~/.anvil/pins.json`). Verifies the slug refers to a known
 * shipped skill before persisting. Errors with a clear message when the
 * cap is hit.
 */
export async function skillPinCommand(name: string): Promise<void> {
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const skill = registry.get(name)
  if (!skill) throw new Error(`skill not found: ${name}`)
  await addPin(name)
  process.stdout.write(chalk.green(`✓ pinned: ${name}\n`))
}

/**
 * ANV-0090 — `anvil skill unpin <slug>`. Removes a slug from
 * `~/.anvil/pins.json`. No-op if the slug is not currently pinned.
 */
export async function skillUnpinCommand(name: string): Promise<void> {
  const pins = await loadPins()
  if (!pins.includes(name)) {
    process.stdout.write(chalk.dim(`not pinned: ${name}\n`))
    return
  }
  await removePin(name)
  process.stdout.write(chalk.green(`✓ unpinned: ${name}\n`))
}

export async function skillDisableCommand(name: string): Promise<void> {
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  if (!config.disabled.skills.includes(name)) config.disabled.skills.push(name)
  await saveConfig(config, { scope: 'project', cwd: process.cwd() })
  process.stdout.write(chalk.yellow(`✓ disabled: ${name}\n`))
}

export async function skillReloadCommand(): Promise<void> {
  process.stdout.write(
    chalk.dim(
      'anvil is not running as a daemon; skills are loaded fresh on every CLI invocation.\n',
    ),
  )
}

export async function skillCreateCommand(
  name: string,
  opts: { group?: string; language?: string },
): Promise<void> {
  const group = opts.group ?? 'development'
  const language = opts.language ?? 'universal'
  const dir =
    language === 'universal'
      ? join(SKILLS_ROOT, 'universal')
      : join(SKILLS_ROOT, 'languages', language)
  const path = join(dir, `${name}.md`)
  if (existsSync(path)) throw new Error(`skill already exists: ${path}`)
  const body = `---
name: ${name}
group: ${group}
description: TODO — one-sentence description
trigger: []
tools: []
language: ${language}
---

# ${name}

TODO — describe what this skill does, its process, and its output.
`
  await writeFile(path, body, 'utf-8')
  process.stdout.write(chalk.green(`✓ created: ${path}\n`))
}

export interface SkillRunOptions {
  inputStdin?: boolean
}

export async function skillRunCommand(
  name: string,
  args: string[],
  opts: SkillRunOptions = {},
): Promise<void> {
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  // ANV-0096 — Accept `<pack>:<slug>` input. Today only the bundled namespace
  // (`anvil:<slug>`) is wired through the in-memory registry; named-pack
  // resolution activates with ANV-0203 (install UX). For now we strip the
  // `anvil:` prefix transparently and reject any other pack name with a
  // clear "not yet installable" message.
  const parsed = parsePackSlug(name)
  let lookupSlug = name
  if (parsed && parsed.pack !== null) {
    if (parsed.pack !== 'anvil') {
      throw new Error(
        `pack '${parsed.pack}' is not installed (third-party pack support lands in ANV-0203). Use a bare slug or 'anvil:${parsed.slug}'.`,
      )
    }
    lookupSlug = parsed.slug
  }
  const skill = registry.get(lookupSlug)
  if (!skill) throw new Error(`skill not found: ${name}`)
  const resolution = resolveModel(lookupSlug, config, { env: process.env })

  // --input-stdin: read stdin and produce a plain-text summary using the
  // skill's algorithmic rules. For the `summarization` skill this applies the
  // Strategy table as a pure-text transformation (no model call required —
  // disable-model-invocation: true keeps spawn cost ≈50ms).
  if (opts.inputStdin) {
    const input = await readStdin()
    if (lookupSlug === 'summarization') {
      const body = await getSkillBody(skill)
      const summary = algorithmicSummarize(input, body)
      process.stdout.write(summary)
      return
    }
    // Generic --input-stdin for other skills: emit skill body + input so the
    // caller can decide what to do with the formatted prompt. Substitute
    // `${ANVIL_*}` tokens (ANV-0134) so downstream prompts see concrete paths.
    process.stdout.write(await renderSkillBody(skill, renderContext()))
    process.stdout.write('\n\n---\n\n')
    process.stdout.write(input)
    return
  }

  process.stdout.write(chalk.bold(`# Skill: ${name}\n\n`))
  process.stdout.write(
    chalk.dim(
      `Model: ${resolution.model}  Effort: ${resolution.effort}  Tools: ${skill.frontmatter.tools.join(', ')}\n\n`,
    ),
  )
  process.stdout.write(chalk.dim('---\n\n'))
  // ANV-0134: substitute artefact-path tokens at render time.
  process.stdout.write(await renderSkillBody(skill, renderContext()))
  if (args.length > 0) {
    process.stdout.write('\n\n---\n\n')
    process.stdout.write(`**Input:** ${args.join(' ')}\n`)
  }
  process.stdout.write('\n')
}

/**
 * Read all of stdin to a string. Returns empty string if stdin is not a pipe
 * or if there is no data.
 */
async function readStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf-8')),
    )
    process.stdin.on('error', () => resolve(''))
  })
}

/**
 * Algorithmic summarization — applies the summarization skill's Strategy table as a
 * pure-text transform. Produces ≤200 words of plain text preserving file paths,
 * error class names, and key field names. No model call required.
 *
 * Strategy dispatch is based on content heuristics matching the skill's table:
 *   diff output  → changed file list + hunk counts per file
 *   test run     → pass/fail counts + first failing test name
 *   stack trace  → error class + message + first 3 frames
 *   JSON output  → top-level field names + first error if present
 *   generic Bash → first meaningful line + last meaningful line
 *   Read         → file path + key declarations
 *   Grep         → match count + first 3 matching lines
 */
export function algorithmicSummarize(
  input: string,
  _skillBody: string,
): string {
  if (!input.trim()) return '[summarization] empty input'

  const lines = input.split('\n')
  const totalLines = lines.length
  const byteCount = Buffer.byteLength(input, 'utf-8')
  const kb = (byteCount / 1024).toFixed(1)

  // Detect content type
  const isDiff =
    input.startsWith('diff --git') ||
    input.startsWith('--- ') ||
    input.includes('\n@@')
  const isStackTrace =
    /\b[A-Z][A-Za-z]*(?:Error|Exception)\b/.test(input) &&
    /^\s+at\s+/m.test(input)
  const isJsonLike =
    input.trimStart().startsWith('{') || input.trimStart().startsWith('[')
  const isTestRun =
    /\b(PASS|FAIL|✓|✗|passed|failed|Tests:)\b/.test(input) &&
    /\b\d+\s*(test|spec|suite)/i.test(input)
  const isGrepOutput = /^\d+:/m.test(input) && totalLines < 200

  const parts: string[] = []

  if (isDiff) {
    // Extract changed files + hunk counts
    const fileRe = /^diff --git a\/.+ b\/(.+)$/gm
    const files: string[] = []
    for (const m of input.matchAll(fileRe)) {
      files.push(m[1])
      if (files.length >= 10) break
    }
    const hunkCount = (input.match(/^@@ /gm) ?? []).length
    const addCount = (input.match(/^\+(?!\+\+)/gm) ?? []).length
    const delCount = (input.match(/^-(?!--)/gm) ?? []).length
    parts.push(`[diff summary — ${totalLines} lines / ${kb} KB]`)
    parts.push(
      `${files.length} file(s) changed: ${files.slice(0, 6).join(', ')}${files.length > 6 ? ` +${files.length - 6} more` : ''}`,
    )
    parts.push(`${hunkCount} hunk(s), +${addCount} -${delCount} lines`)
  } else if (isStackTrace) {
    // Error class + message + first 3 frames
    const errMatch =
      /\b([A-Z][A-Za-z]*(?:Error|Exception)):?\s*([^\n]{0,120})/m.exec(input)
    const frameLines = lines.filter((l) => /^\s+at\s+/.test(l)).slice(0, 3)
    parts.push(`[stack trace — ${totalLines} lines / ${kb} KB]`)
    if (errMatch) parts.push(`${errMatch[1]}: ${errMatch[2].trim()}`)
    parts.push(...frameLines.map((l) => l.trim()))
  } else if (isTestRun) {
    // Pass/fail counts + first failing test name
    const passMatch = /(\d+)\s+(?:test(?:s)?|spec(?:s)?)\s+passed/i.exec(input)
    const failMatch = /(\d+)\s+(?:test(?:s)?|spec(?:s)?)\s+failed/i.exec(input)
    const failNameMatch = /(?:FAIL|✗|●)\s+([^\n]{0,100})/m.exec(input)
    parts.push(`[test run — ${totalLines} lines / ${kb} KB]`)
    const counts: string[] = []
    if (passMatch) counts.push(`${passMatch[1]} passed`)
    if (failMatch) counts.push(`${failMatch[1]} failed`)
    if (counts.length > 0) parts.push(counts.join(', '))
    if (failNameMatch) parts.push(`First failure: ${failNameMatch[1].trim()}`)
  } else if (isJsonLike) {
    // Top-level field names + value types + first error
    try {
      const obj = JSON.parse(input) as unknown
      if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
        const keys = Object.keys(obj as Record<string, unknown>).slice(0, 8)
        parts.push(`[JSON — ${totalLines} lines / ${kb} KB]`)
        parts.push(`Fields: ${keys.join(', ')}`)
        const rec = obj as Record<string, unknown>
        if ('error' in rec || 'errors' in rec || 'message' in rec) {
          const errVal = rec.error ?? rec.errors ?? rec.message
          parts.push(`Error: ${String(errVal).slice(0, 120)}`)
        }
      } else if (Array.isArray(obj)) {
        parts.push(
          `[JSON array — ${(obj as unknown[]).length} items / ${kb} KB]`,
        )
        const firstItem = (obj as unknown[])[0]
        if (firstItem && typeof firstItem === 'object' && firstItem !== null) {
          const keys = Object.keys(firstItem as Record<string, unknown>).slice(
            0,
            6,
          )
          parts.push(`Item fields: ${keys.join(', ')}`)
        }
      }
    } catch {
      // Malformed JSON — fall through to generic
      parts.push(`[JSON-like — ${totalLines} lines / ${kb} KB]`)
    }
  } else if (isGrepOutput) {
    // Match count + first 3 matching lines with line numbers
    const matchingLines = lines.filter((l) => /^\d+:/.test(l)).slice(0, 3)
    parts.push(`[grep — ${totalLines} lines / ${kb} KB]`)
    parts.push(`${totalLines} match(es)`)
    parts.push(...matchingLines)
  } else {
    // Generic: first meaningful line + last meaningful line + any paths/errors
    const meaningful = lines.filter((l) => l.trim().length > 0)
    parts.push(`[output — ${totalLines} lines / ${kb} KB]`)
    if (meaningful.length > 0) parts.push(meaningful[0].slice(0, 120))
    if (meaningful.length > 1) parts.push('...')
    if (meaningful.length > 1)
      parts.push(meaningful[meaningful.length - 1].slice(0, 120))
  }

  // Append any error class names found anywhere
  const errorRe = /\b([A-Z][A-Za-z]*(?:Error|Exception)|E[A-Z_]{2,})\b/g
  const errors = new Set<string>()
  for (const m of input.matchAll(errorRe)) {
    errors.add(m[1])
    if (errors.size >= 4) break
  }
  if (errors.size > 0 && !isStackTrace) {
    parts.push(`Errors: ${[...errors].join(', ')}`)
  }

  // Append key file paths
  const pathRe = /(?:^|\s)((?:\.\.?\/|\/|\w:[/\\])[^\s'"`,;)]+)/gm
  const paths = new Set<string>()
  for (const m of input.matchAll(pathRe)) {
    const p = m[1].replace(/[.,;)]+$/, '')
    if (p.includes('.') || p.startsWith('/')) paths.add(p)
    if (paths.size >= 5) break
  }
  if (paths.size > 0 && !isDiff) {
    parts.push(`Paths: ${[...paths].join(', ')}`)
  }

  const result = parts.join('\n')

  // Enforce ≤200-word limit — truncate parts if needed
  const words = result.split(/\s+/).filter(Boolean)
  if (words.length <= 200) return result

  // Trim to 200 words
  return `${words.slice(0, 200).join(' ')} [truncated]`
}

export interface SkillSearchOptions extends CliOptions {}

export async function skillSearchCommand(
  query: string,
  opts: SkillSearchOptions,
): Promise<void> {
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const q = query.toLowerCase()

  const matches = registry.getAll().filter((s) => {
    const fm = s.frontmatter
    return (
      fm.name.toLowerCase().includes(q) ||
      (fm.description ?? '').toLowerCase().includes(q) ||
      (fm.group ?? '').toLowerCase().includes(q) ||
      (fm.trigger ?? []).some((t: string) => t.toLowerCase().includes(q)) ||
      (fm.tags ?? []).some((t: string) => t.toLowerCase().includes(q)) ||
      (fm.aliases ?? []).some((a: string) => a.toLowerCase().includes(q))
    )
  })

  const rows = matches.map((s) => ({
    name: s.frontmatter.name,
    group: s.frontmatter.group,
    language: s.frontmatter.language,
    description: s.frontmatter.description ?? '',
  }))

  if (maybeEmitJson(rows, opts)) return

  if (rows.length === 0) {
    process.stdout.write(chalk.yellow(`No skills match "${query}".\n`))
    return
  }

  const tableData = [
    ['Skill', 'Group', 'Lang', 'Description'],
    ...rows.map((r) => [
      chalk.cyan(r.name),
      r.group,
      r.language,
      r.description,
    ]),
  ]
  process.stdout.write(table(tableData))
}

export interface SkillEvalOptions extends CliOptions {
  rubric?: boolean
}

export async function skillEvalCommand(
  name: string,
  opts: SkillEvalOptions = {},
): Promise<void> {
  if (opts.rubric) {
    await runRubricEval(name, opts)
    return
  }
  const { evaluateSkill } = await import('../../skills/eval/runner.js')
  // Prefer frontmatter eval_fixtures when present; fall back to file-based
  // fixtures under tests/fixtures/skill-eval/<name>/.
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const skill = registry.get(name)
  const frontmatterFixtures = skill?.frontmatter.eval_fixtures
  const fixturesRoot = join(
    SKILLS_ROOT,
    '..',
    'tests',
    'fixtures',
    'skill-eval',
  )
  const result = await evaluateSkill(name, {
    fixturesRoot,
    skillsRoot: SKILLS_ROOT,
    frontmatterFixtures,
  })

  if (maybeEmitJson(result, opts)) return

  if (result.total === 0) {
    process.stdout.write(
      chalk.yellow(
        `No fixtures found for "${name}". Create fixtures at tests/fixtures/skill-eval/${name}/\n`,
      ),
    )
    return
  }

  const pct = result.score * 100
  const scoreColor =
    result.score >= 0.8 ? 'green' : result.score >= 0.5 ? 'yellow' : 'red'
  process.stdout.write(
    chalk[scoreColor](
      `${name}: ${pct.toFixed(0)}% (${result.passed}/${result.total} passed)\n`,
    ),
  )

  const tableData = [
    ['Type', 'Description', 'Pass'],
    ...result.details.map((d) => [
      d.type,
      d.description,
      d.passed ? chalk.green('✓') : chalk.red('✗'),
    ]),
  ]
  process.stdout.write(table(tableData))
}

// Note: selectSkills operates on the full registry (including isHidden skills).
// Hidden skills are intentionally selectable by the router even if they are
// omitted from `anvil skill list`. This is by design — hidden skills are
// library/internal helpers that shouldn't clutter the list but can still match.
export async function skillSelectCommand(
  prompt: string,
  opts: CliOptions = {},
): Promise<void> {
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const context = await detectProject(process.cwd())
  const skills = selectSkills(prompt, registry, context)
  const rows = skills.map((s) => ({
    name: s.frontmatter.name,
    group: s.frontmatter.group,
    language: s.frontmatter.language,
  }))
  if (maybeEmitJson(rows, opts)) return
  if (skills.length === 0) {
    process.stdout.write(chalk.yellow('No skill matched the prompt.\n'))
    return
  }
  process.stdout.write(chalk.bold('Routed skills (most relevant first):\n'))
  for (const s of skills) {
    process.stdout.write(
      `  - ${chalk.cyan(s.frontmatter.name)} (${s.frontmatter.group}, ${s.frontmatter.language})\n`,
    )
  }
}

async function runRubricEval(
  name: string,
  opts: SkillEvalOptions,
): Promise<void> {
  const { evaluateRubric } = await import('../../skills/eval/rubric.js')
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const skill = registry.get(name)
  if (!skill) {
    process.stdout.write(chalk.red(`skill not found: ${name}\n`))
    process.exit(1)
  }
  const result = await evaluateRubric(skill)
  if (maybeEmitJson(result, opts)) return

  const scoreColor =
    result.total >= 8 ? 'green' : result.total >= 5 ? 'yellow' : 'red'
  process.stdout.write(
    chalk[scoreColor](`${name}: ${result.total}/10 (rubric)\n`),
  )
  const tableData = [
    ['Axis', 'Score', 'Note'],
    ...result.axisScores.map((a) => [a.axis, String(a.score), a.note]),
  ]
  process.stdout.write(table(tableData))
}
