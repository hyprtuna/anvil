import { cancel, intro, isCancel, log, outro, spinner } from '@clack/prompts'
import chalk from 'chalk'
import { printInstallSummary } from '../commands/cli/common/report.js'
import {
  DEFAULT_EXPECTED_TOKENS_WARN,
  aggregateExpectedTokens,
  formatExpectedTokensSummary,
  shouldWarnBundle,
} from '../core/expected-tokens.js'
import type { PresetName, Scope, Target } from '../core/types.js'
import { buildContextFromRepo } from '../installer/context-from-repo.js'
import { linkCli } from '../installer/link-cli.js'
import { syncAnvilHome } from '../installer/sync.js'
import { applyTargets, resolveWireTargets } from '../installer/wire.js'
import { runCliScreen } from './screens/cli.js'
import { runLanguagesScreen } from './screens/languages.js'
import { runModelsScreen } from './screens/models.js'
import { runPreviewScreen } from './screens/preview.js'
import { runScopeScreen } from './screens/scope.js'
import { runStatuslineScreen } from './screens/statusline.js'
import { runTargetScreen } from './screens/target.js'
import { runWelcome } from './screens/welcome.js'

export interface TuiOptions {
  yes?: boolean
  target: string
  scope: string
  preset: string
  dryRun?: boolean
  /** Pre-seeded from `--statusline`; when set the screen is skipped. */
  statusline?: boolean
  /** Pre-seeded from `--cli`; when set the screen is skipped. */
  cli?: boolean
  /**
   * Pre-seeded from `--target`. When set the target screen is skipped.
   * Caller has already resolved --claude/--opencode into this value.
   */
  targetPreSeeded?: boolean
  /**
   * Pre-seeded from `--scope`. When set the scope screen is skipped.
   */
  scopePreSeeded?: boolean
  /**
   * Pre-seeded from `--preset`. When set the models screen is skipped.
   */
  presetPreSeeded?: boolean
  /**
   * ANV-0114 — when true, suppresses the cumulative expected_tokens warning
   * even if the selection-wide sum exceeds the configured threshold. The
   * informational budget line is still rendered.
   */
  allowLargeBundle?: boolean
}

export async function runInstallerTui(opts: TuiOptions): Promise<void> {
  intro(chalk.bold.cyan('⚒  Anvil — skill system installer'))
  await runWelcome()
  // D-07: skip screen when flag was supplied (pre-seed semantics).
  const target = opts.targetPreSeeded
    ? (opts.target as Target)
    : ((await bail(runTargetScreen())) as Target)
  const scope = opts.scopePreSeeded
    ? (opts.scope as Scope)
    : ((await bail(runScopeScreen())) as Scope)
  await runLanguagesScreen()
  const preset = opts.presetPreSeeded
    ? (opts.preset as PresetName)
    : ((await bail(runModelsScreen())) as PresetName)
  const wantCli = opts.cli ?? (await bail(runCliScreen()))
  const wantStatusline = opts.statusline ?? (await bail(runStatuslineScreen()))
  const confirmed = await bail(runPreviewScreen({ target, scope, preset }))
  if (!confirmed) {
    cancel('Install cancelled.')
    return
  }

  // D-08: dry-run exits after preview confirmation without writing anything.
  if (opts.dryRun) {
    outro(chalk.green('✓ Dry run — no files written.'))
    return
  }

  const s = spinner()
  s.start('Installing Anvil')
  const cwd = process.cwd()
  const ctx = await buildContextFromRepo({
    sourceKind: 'local',
    sourceValue: cwd,
    scope,
    preset,
  })

  // ANV-0114 — render the cumulative expected-token budget before sync so
  // the user sees the bundle "cost" of the selection inline with the spinner.
  const expectedTokens = aggregateExpectedTokens(ctx.skills, ctx.agents)
  const bundleThreshold =
    ctx.config.compression?.expected_tokens_warn ?? DEFAULT_EXPECTED_TOKENS_WARN
  s.stop(`Bundle: ${formatExpectedTokensSummary(expectedTokens)}`)
  if (
    !opts.allowLargeBundle &&
    shouldWarnBundle(expectedTokens, bundleThreshold)
  ) {
    log.warn(
      `cumulative expected_tokens (~${expectedTokens.totalKnown}) exceeds threshold ${bundleThreshold} — re-run with --allow-large-bundle to suppress`,
    )
  }
  s.start('Installing Anvil')

  const syncResult = await syncAnvilHome({ ctx })
  const wireTargets = resolveWireTargets(target, scope)
  const wireResults = await applyTargets(wireTargets, {
    anvilHome: syncResult.anvilHome,
    projectRoot: cwd,
    statusline: wantStatusline,
    preset,
    effort: ctx.config.defaults.effort,
  })
  const cliResult = wantCli
    ? await linkCli({ anvilHome: syncResult.anvilHome })
    : null
  s.stop('Installed')

  type Row = {
    id: string
    status: 'wrote' | 'skipped' | 'error'
    detail?: string
  }
  const targetRows: Row[] = wireTargets.map((id): Row => {
    const r = wireResults[id]
    if (!r) return { id, status: 'skipped' }
    const firstAction = r.actions[0] ?? ''
    const isError =
      firstAction.toLowerCase().includes('error') ||
      firstAction.toLowerCase().includes('fail')
    return {
      id,
      status: isError ? 'error' : 'wrote',
      detail: r.actions.slice(0, 2).join('; ') || undefined,
    }
  })
  if (cliResult) {
    targetRows.push({
      id: 'cli-symlink',
      status: 'wrote',
      detail: `${cliResult.linkPath} → ${cliResult.target}`,
    })
  }

  printInstallSummary({
    anvilHome: syncResult.anvilHome,
    version: syncResult.version,
    filesWritten: syncResult.filesWritten,
    targets: targetRows,
  })

  outro(chalk.green('✓ Anvil installed. Run `anvil doctor` to verify.'))
}

async function bail<T>(p: Promise<T | symbol>): Promise<T> {
  const v = await p
  if (isCancel(v)) {
    cancel('Cancelled')
    process.exit(0)
  }
  return v as T
}
