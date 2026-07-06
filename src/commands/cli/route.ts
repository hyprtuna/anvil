import chalk from 'chalk'
import { detectProject } from '../../core/project/detect.js'
import { renderRoutingBanner } from '../../core/routing-banner.js'
import type { ProjectContext } from '../../core/types.js'
import { detectIntents, route } from '../../intent/router.js'
import { maybeEmitJson } from './common/json-mode.js'

/** Minimal stub when project detection fails or is unavailable. */
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

export interface RouteOptions {
  json?: boolean
  color?: boolean
  projectDir?: string
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage: anvil route <prompt> [options]',
      '',
      'Options:',
      '  --json             Emit JSON output only (machine-readable)',
      '  --no-color         Disable ANSI colour output',
      '  --project-dir <p>  Project root for context detection (default: cwd)',
      '',
      'Examples:',
      '  anvil route "plan an OAuth feature"',
      '  anvil route --json "fix this bug"',
      '  anvil route --project-dir /my/project "write tests for the auth module"',
      '',
    ].join('\n'),
  )
}

export async function routeCommand(
  prompt: string,
  opts: RouteOptions = {},
): Promise<void> {
  if (!prompt || prompt.trim().length === 0) {
    printUsage()
    process.exit(2)
  }

  // Disable chalk when --no-color is passed
  if (opts.color === false) {
    chalk.level = 0
  }

  // Resolve project context
  const projectDir = opts.projectDir ?? process.cwd()
  let context: ProjectContext
  try {
    context = await detectProject(projectDir)
  } catch {
    context = stubProjectContext()
  }

  // Run intent pipeline
  const detectedIntents = detectIntents(prompt)
  const decision = route(
    prompt,
    {
      availableSkills: new Set(),
      availableAgents: new Set(),
    },
    context,
  )

  // --json: emit raw JSON and exit
  if (maybeEmitJson(decision, opts)) return

  // Human-readable output
  const banner = renderRoutingBanner(decision)
  if (banner) {
    process.stdout.write(`${banner}\n`)
  }

  process.stdout.write('\n')

  // Top intents section
  const topIntents = detectedIntents.slice(0, 3)
  if (topIntents.length > 0) {
    process.stdout.write(chalk.bold('Top intents:\n'))
    for (const di of topIntents) {
      const keywords = di.matchedKeywords.join(', ')
      process.stdout.write(
        `  ${chalk.cyan(di.intent)}  score=${chalk.yellow(String(di.score))}  keywords=[${keywords}]\n`,
      )
    }
  } else {
    process.stdout.write(
      chalk.dim('No intents detected — routing to main fallback.\n'),
    )
  }

  process.stdout.write('\n')

  // Recommended skills section
  if (decision.skills.length > 0) {
    process.stdout.write(chalk.bold('Recommended skills:\n'))
    decision.skills.forEach((skill, idx) => {
      process.stdout.write(`  ${idx + 1}. ${chalk.cyan(skill)}\n`)
    })
  } else {
    process.stdout.write(chalk.dim('Recommended skills: (none)\n'))
  }

  process.stdout.write('\n')

  // Recommended agents section
  process.stdout.write(chalk.bold('Recommended agent:\n'))
  process.stdout.write(`  ${chalk.cyan(decision.agent)}\n`)

  if (decision.fallback) {
    process.stdout.write(chalk.dim(`  (fallback: ${decision.fallback})\n`))
  }

  process.stdout.write('\n')
  process.stdout.write(
    chalk.dim(
      'Run `anvil route --json <prompt>` for machine-readable output.\n',
    ),
  )
}
