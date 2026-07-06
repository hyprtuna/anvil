import { join } from 'node:path'
import chalk from 'chalk'
import {
  DEFAULT_EXPECTED_TOKENS_WARN,
  aggregateExpectedTokens,
  formatExpectedTokensSummary,
  shouldWarnBundle,
} from '../../core/expected-tokens.js'
import type { PresetName, Scope } from '../../core/types.js'
import { buildContextFromRepo } from '../../installer/context-from-repo.js'
import { diffAnvilHome } from '../../installer/diff.js'
import { linkCli } from '../../installer/link-cli.js'
import { syncAnvilHome } from '../../installer/sync.js'
import { applyTargets, resolveWireTargets } from '../../installer/wire.js'
import { runInstallerTui } from '../../tui/installer.js'
import { printInstallSummary } from './common/report.js'

export interface InitOptions {
  yes?: boolean
  target: string
  scope: string
  preset: string
  dryRun?: boolean
  diff?: boolean
  claude?: string // 'yes' | 'no' | undefined
  opencode?: string // 'yes' | 'no' | undefined
  /** Enable Claude Code status line integration. */
  statusline?: boolean
  /** Create `~/.local/bin/anvil` symlink so `anvil` is on PATH. */
  cli?: boolean
  json?: boolean
  /**
   * Plan 28 Phase E4. Skip interactive prompts even when stdin is a TTY.
   * Behaves like `--yes` but is the canonical CI-friendly form.
   */
  headless?: boolean
  /** Plan 28 E4 alias for `--headless`. */
  noTui?: boolean
  /**
   * ANV-0060. Bypass the adapter cross-contamination guard.
   * Use only when intentionally writing across adapter boundaries.
   */
  allowCrossTarget?: boolean
  /**
   * ANV-0114. Suppress the cumulative `expected_tokens` warning when the
   * selection-wide sum exceeds the configured threshold. The aggregate is
   * still computed and rendered above the file-write summary; only the
   * yellow-warn line is omitted.
   */
  allowLargeBundle?: boolean
}

/**
 * Resolve the effective target from --claude/--opencode flags or fall back to --target.
 * Returns the resolved target and a warning message if flags conflict.
 */
function resolveTarget(opts: InitOptions): {
  target: string
  warning?: string
} {
  const hasClaudeFlag = opts.claude !== undefined
  const hasOpencodeFlag = opts.opencode !== undefined
  const hasTargetFlag = opts.target !== 'both' // 'both' is the default

  if (!hasClaudeFlag && !hasOpencodeFlag) {
    return { target: opts.target }
  }

  const wantClaude = opts.claude === 'yes'
  const wantOpencode = opts.opencode === 'yes'
  const claudeOpencodeHaveEffect = wantClaude || wantOpencode

  let warning: string | undefined
  if (hasTargetFlag && claudeOpencodeHaveEffect) {
    warning = '--target flag ignored; using --claude/--opencode flags instead'
  }

  if (wantClaude && wantOpencode) return { target: 'both', warning }
  if (wantClaude) return { target: 'claude-code', warning }
  if (wantOpencode) return { target: 'opencode', warning }

  return { target: opts.target }
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const { target, warning } = resolveTarget(opts)
  if (warning) process.stderr.write(chalk.yellow(`warning: ${warning}\n`))

  if (opts.diff) {
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: process.cwd(),
      scope: opts.scope as Scope,
      preset: opts.preset as PresetName,
    })
    const anvilHome = join(ctx.home ?? process.env.HOME ?? '/tmp', '.anvil')
    const report = await diffAnvilHome(ctx, anvilHome)

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      return
    }

    const { summary, paths } = report
    process.stdout.write(
      `${chalk.bold(`anvil init --diff (vs ${anvilHome}):`)}\n`,
    )
    process.stdout.write(
      `  ${chalk.green(`+${summary.new}`)} new · ` +
        `${chalk.yellow(`~${summary.changed}`)} changed · ` +
        `${chalk.red(`-${summary.deleted}`)} deleted · ` +
        `${chalk.gray(`=${summary.unchanged}`)} unchanged\n\n`,
    )
    for (const p of paths) {
      if (p.status === 'unchanged') continue
      const tag =
        p.status === 'new'
          ? chalk.green('+')
          : p.status === 'changed'
            ? chalk.yellow('~')
            : chalk.red('-')
      const counts =
        p.status === 'changed'
          ? chalk.gray(` (+${p.added} -${p.removed})`)
          : p.status === 'new'
            ? chalk.gray(` (+${p.added})`)
            : ''
      process.stdout.write(`  ${tag} ${p.relativePath}${counts}\n`)
    }
    return
  }

  // Plan 28 E4: --headless / --no-tui force the non-interactive path even
  // when stdin is a TTY. They are functional aliases for --yes.
  const headless = opts.yes || opts.headless || opts.noTui
  if (!headless) {
    await runInstallerTui({
      ...opts,
      target,
      statusline: opts.statusline,
      cli: opts.cli,
      allowLargeBundle: opts.allowLargeBundle,
      // D-07: tell the TUI which screens to skip because the flag was supplied.
      targetPreSeeded:
        opts.target !== 'both' ||
        opts.claude !== undefined ||
        opts.opencode !== undefined,
      scopePreSeeded: opts.scope !== 'project',
      presetPreSeeded: opts.preset !== 'balanced',
    })
    return
  }

  const ctx = await buildContextFromRepo({
    sourceKind: 'local',
    sourceValue: process.cwd(),
    scope: opts.scope as Scope,
    preset: opts.preset as PresetName,
  })

  // ANV-0114 — render the cumulative expected-token budget before sync, so
  // the user sees the bundle "cost" while staging runs. `--allow-large-bundle`
  // suppresses the warning but not the summary line.
  const expectedTokens = aggregateExpectedTokens(ctx.skills, ctx.agents)
  const bundleThreshold =
    ctx.config.compression?.expected_tokens_warn ?? DEFAULT_EXPECTED_TOKENS_WARN
  process.stdout.write(
    `${chalk.dim('  budget:')} ${formatExpectedTokensSummary(expectedTokens)}\n`,
  )
  if (
    !opts.allowLargeBundle &&
    shouldWarnBundle(expectedTokens, bundleThreshold)
  ) {
    process.stderr.write(
      chalk.yellow(
        `warning: cumulative expected_tokens (~${expectedTokens.totalKnown}) exceeds threshold ${bundleThreshold} — re-run with --allow-large-bundle to suppress\n`,
      ),
    )
  }

  const result = await syncAnvilHome({ ctx })

  const wireTargets = resolveWireTargets(target, opts.scope)
  const wireResults = await applyTargets(wireTargets, {
    anvilHome: result.anvilHome,
    projectRoot: process.cwd(),
    statusline: opts.statusline,
    preset: opts.preset,
    effort: ctx.config.defaults.effort,
    allowCrossTarget: opts.allowCrossTarget,
  })

  const cliResult = opts.cli
    ? await linkCli({ anvilHome: result.anvilHome })
    : null

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ ...result, wireResults, cli: cliResult }, null, 2)}\n`,
    )
    return
  }

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
    anvilHome: result.anvilHome,
    version: result.version,
    filesWritten: result.filesWritten,
    targets: targetRows,
  })
}
