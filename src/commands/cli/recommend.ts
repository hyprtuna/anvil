import chalk from 'chalk'
import { z } from 'zod'
import { detectProject } from '../../core/project/detect.js'
import {
  type RecommendSurfaceFilter,
  type Recommendation,
  recommendForContext,
} from '../../core/recommend/recommender.js'
import type { ProjectContext } from '../../core/types.js'
import { maybeEmitJson } from './common/json-mode.js'

const SurfaceFilter = z.enum(['skills', 'hooks', 'agents', 'mcps', 'all'])

export const RecommendOptionsSchema = z.object({
  path: z.string().optional(),
  json: z.boolean().optional(),
  top: z.number().int().positive().optional(),
  surface: SurfaceFilter.optional(),
  color: z.boolean().optional(),
})

export type RecommendOptions = z.infer<typeof RecommendOptionsSchema>

function stubProjectContext(): ProjectContext {
  return {
    languages: [],
    frameworks: [],
    testRunners: [],
    packageManager: undefined,
    ci: [],
    detectedAt: new Date().toISOString(),
  }
}

function pad(s: string, width: number): string {
  if (s.length >= width) return s
  return s + ' '.repeat(width - s.length)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}

function renderTable(recs: Recommendation[]): string {
  if (recs.length === 0) return chalk.dim('  (no recommendations)\n')

  const slugCol = Math.max(4, ...recs.map((r) => r.slug.length))
  const scoreCol = 5
  const reasonCol = Math.min(
    60,
    Math.max(6, ...recs.map((r) => truncate(r.reasons.join('; '), 60).length)),
  )
  const installCol = Math.max(10, ...recs.map((r) => r.install_cmd.length))

  const header = [
    chalk.bold(pad('slug', slugCol)),
    chalk.bold(pad('score', scoreCol)),
    chalk.bold(pad('reason', reasonCol)),
    chalk.bold(pad('install_cmd', installCol)),
  ].join('  ')

  const lines: string[] = [header]
  for (const r of recs) {
    const reasonText = truncate(r.reasons.join('; '), reasonCol)
    lines.push(
      [
        chalk.cyan(pad(r.slug, slugCol)),
        chalk.yellow(pad(r.score.toFixed(2), scoreCol)),
        pad(reasonText, reasonCol),
        chalk.dim(pad(r.install_cmd, installCol)),
      ].join('  '),
    )
  }
  return `${lines.join('\n')}\n`
}

function groupBySurface(
  recs: Recommendation[],
): Record<string, Recommendation[]> {
  const out: Record<string, Recommendation[]> = {
    skill: [],
    hook: [],
    agent: [],
    mcp: [],
  }
  for (const r of recs) {
    out[r.surface].push(r)
  }
  return out
}

const SURFACE_HEADINGS: Record<string, string> = {
  skill: 'Skills',
  hook: 'Hooks',
  agent: 'Agents',
  mcp: 'MCPs',
}

export async function recommendCommand(
  opts: RecommendOptions = {},
): Promise<void> {
  const parsed = RecommendOptionsSchema.parse(opts)

  if (parsed.color === false) {
    chalk.level = 0
  }

  const projectDir = parsed.path ?? process.cwd()
  let context: ProjectContext
  try {
    context = await detectProject(projectDir)
  } catch {
    context = stubProjectContext()
  }

  const surface: RecommendSurfaceFilter = parsed.surface ?? 'all'
  const recommendations = recommendForContext(context, {
    surface,
    top: parsed.top,
  })

  if (
    maybeEmitJson(
      {
        recommendations,
        context,
        topN: parsed.top ?? recommendations.length,
      },
      parsed,
    )
  ) {
    return
  }

  process.stdout.write(
    `${chalk.bold('anvil recommend')} — ${chalk.dim(projectDir)}\n\n`,
  )

  if (recommendations.length === 0) {
    process.stdout.write(
      chalk.dim('No recommendations matched the detected signals.\n'),
    )
    return
  }

  const groups = groupBySurface(recommendations)
  const order: ReadonlyArray<keyof typeof groups> = [
    'skill',
    'agent',
    'hook',
    'mcp',
  ]
  for (const s of order) {
    const list = groups[s]
    if (list.length === 0) continue
    process.stdout.write(`${chalk.bold(SURFACE_HEADINGS[s])}\n`)
    process.stdout.write(renderTable(list))
    process.stdout.write('\n')
  }

  process.stdout.write(
    chalk.dim(
      'Run `anvil recommend --json` for machine-readable output, or copy an install_cmd above.\n',
    ),
  )
}
