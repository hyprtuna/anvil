/**
 * ANV-0182 — `skill eval` dev script.
 *
 * Extracted from src/commands/cli/skill.ts (eval subcommand only).
 * Invoked via: bun run scripts/dev/skill-eval.ts <name> [--rubric] [--json]
 *
 * This is contributor-only tooling; it is NOT registered in the user-facing
 * `anvil` CLI binary. Use `npm run dev:skill-eval -- <name>` or
 * `bun run scripts/dev/skill-eval.ts <name>` directly.
 */

import { dirname, join } from 'node:path'
import chalk from 'chalk'
import { table } from 'table'

const __dirname = dirname(fileURLToPath(import.meta.url))
// scripts/dev/ is two levels above the repo root's src/ so we resolve via root
const REPO_ROOT = join(__dirname, '..', '..')
const SKILLS_ROOT = join(REPO_ROOT, 'src', '..', 'skills')

// Re-resolve to handle the src/ structure correctly
const ANVIL_ROOT = REPO_ROOT
const SKILLS_DIR = join(ANVIL_ROOT, 'skills')

export interface SkillEvalOptions {
  json?: boolean
  rubric?: boolean
}

export async function skillEvalCommand(
  name: string,
  opts: SkillEvalOptions = {},
): Promise<void> {
  const { loadAllSkills } = await import('../../src/skills/load-all.js')
  const { maybeEmitJson } = await import(
    '../../src/commands/cli/common/json-mode.js'
  )

  if (opts.rubric) {
    await runRubricEval(name, opts, {
      loadAllSkills,
      maybeEmitJson,
      skillsRoot: SKILLS_DIR,
    })
    return
  }

  const { evaluateSkill } = await import('../../src/skills/eval/runner.js')
  const registry = await loadAllSkills({ skillsRoot: SKILLS_DIR })
  const skill = registry.get(name)
  const frontmatterFixtures = skill?.frontmatter.eval_fixtures
  const fixturesRoot = join(ANVIL_ROOT, 'tests', 'fixtures', 'skill-eval')
  const result = await evaluateSkill(name, {
    fixturesRoot,
    skillsRoot: SKILLS_DIR,
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
    ...result.details.map(
      (d: { type: string; description: string; passed: boolean }) => [
        d.type,
        d.description,
        d.passed ? chalk.green('✓') : chalk.red('✗'),
      ],
    ),
  ]
  process.stdout.write(table(tableData))
}

async function runRubricEval(
  name: string,
  opts: SkillEvalOptions,
  deps: {
    loadAllSkills: (opts: { skillsRoot: string }) => Promise<{
      get: (name: string) => unknown
    }>
    maybeEmitJson: (data: unknown, opts: { json?: boolean }) => boolean
    skillsRoot: string
  },
): Promise<void> {
  const { evaluateRubric } = await import('../../src/skills/eval/rubric.js')
  const registry = await deps.loadAllSkills({ skillsRoot: deps.skillsRoot })
  const skill = registry.get(name)
  if (!skill) {
    process.stdout.write(chalk.red(`skill not found: ${name}\n`))
    process.exit(1)
  }
  const result = await evaluateRubric(skill)
  if (deps.maybeEmitJson(result, opts)) return

  const scored = result as {
    total: number
    axisScores: Array<{ axis: string; score: number; note: string }>
  }
  const scoreColor =
    scored.total >= 8 ? 'green' : scored.total >= 5 ? 'yellow' : 'red'
  process.stdout.write(
    chalk[scoreColor](`${name}: ${scored.total}/10 (rubric)\n`),
  )
  const tableData = [
    ['Axis', 'Score', 'Note'],
    ...scored.axisScores.map((a) => [a.axis, String(a.score), a.note]),
  ]
  process.stdout.write(table(tableData))
}

// ---------------------------------------------------------------------------
// CLI entrypoint (when run directly via `bun run scripts/dev/skill-eval.ts`)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const name = args.find((a) => !a.startsWith('-'))
  if (!name) {
    process.stderr.write(
      'Usage: bun run scripts/dev/skill-eval.ts <skill-name> [--rubric] [--json]\n',
    )
    process.exit(1)
  }
  const opts: SkillEvalOptions = {
    json: args.includes('--json'),
    rubric: args.includes('--rubric'),
  }
  await skillEvalCommand(name, opts)
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  })
}
