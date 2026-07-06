import { exec } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { loadConfig } from '../../../core/config/load.js'
import { getUserHome } from '../../../core/io/home.js'
import { resolveModel } from '../../../core/models/resolve.js'
import {
  type RuntimeContext,
  resolveRuntimeContext,
} from '../../../core/runtime/context.js'
import { renderSkillBody } from '../../../skills/body.js'
import { loadAllSkills } from '../../../skills/load-all.js'

export const execAsync = promisify(exec)

const __dirname = dirname(fileURLToPath(import.meta.url))
const ANVIL_ROOT = join(__dirname, '..', '..', '..', '..')
const SKILLS_ROOT = join(ANVIL_ROOT, 'skills')

export interface InvokeSkillOptions {
  /**
   * Plan 38 Phase D — per-invocation tier injection.
   * When provided, forwarded as `cli.tier` into the resolver call site.
   * `cli.model` (if also provided) takes precedence over `cli.tier`.
   */
  tier?: string
  /** Explicit model override (forwarded as `cli.model`). */
  model?: string
  /**
   * ANV-0176 — session runtime context (autoMode + acceptDefaults). When
   * absent, the helper falls back to `resolveRuntimeContext({env: process.env,
   * cli: {}})` so env-only invocations (`ANVIL_AUTO=1 anvil discuss …`) still
   * pick up the flags. Callers that have already parsed CLI flags should
   * pass an explicit value.
   */
  runtimeContext?: RuntimeContext
}

export async function invokeSkill(
  name: string,
  input: string,
  opts: InvokeSkillOptions = {},
): Promise<void> {
  const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
  const config = await loadConfig({ scope: 'project', cwd: process.cwd() })
  const skill = registry.get(name)
  if (!skill) throw new Error(`skill not found: ${name}`)
  const cliOpts =
    opts.model || opts.tier ? { model: opts.model, tier: opts.tier } : undefined
  const resolution = resolveModel(name, config, {
    env: process.env,
    ...(cliOpts ? { cli: cliOpts } : {}),
  })

  process.stdout.write(chalk.bold(`# anvil ${name}\n\n`))
  process.stdout.write(
    chalk.dim(`Model: ${resolution.model}  Effort: ${resolution.effort}\n`),
  )
  process.stdout.write(chalk.dim(`Source: ${resolution.source}\n`))
  process.stdout.write(
    chalk.dim(`Tools: ${skill.frontmatter.tools.join(', ')}\n\n`),
  )
  process.stdout.write(chalk.dim(`${'─'.repeat(72)}\n\n`))
  // ANV-0134: substitute ${ANVIL_*} tokens against the current project root
  // so artefact-path references in skill bodies render as concrete paths.
  // ANV-0137: `userRoot` enables user-template overrides under ~/.anvil/templates/.
  // ANV-0176: resolve runtimeContext (auto-mode / accept-defaults). When the
  // caller did not supply one, derive from env so `ANVIL_AUTO=1 anvil discuss
  // …` still engages auto-mode without a flag.
  const runtimeContext =
    opts.runtimeContext ?? resolveRuntimeContext({ env: process.env, cli: {} })
  process.stdout.write(
    await renderSkillBody(skill, {
      anvilRoot: ANVIL_ROOT,
      projectRoot: process.cwd(),
      scope: 'project',
      userRoot: join(getUserHome(), '.anvil'),
      runtimeContext,
    }),
  )
  process.stdout.write('\n\n')
  process.stdout.write(chalk.dim(`─── Input ${'─'.repeat(63)}\n\n`))
  process.stdout.write(`${input}\n`)
}
