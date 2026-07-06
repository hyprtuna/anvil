/**
 * Builds and returns the commander `init` subcommand as a standalone function.
 *
 * Extracted from src/index.ts so that tests can enumerate the registered
 * options without parsing process.argv. This is the single source of truth
 * for the `anvil init` flag surface (D-01).
 */
import { Command } from 'commander'

/**
 * Build the `init` subcommand with all registered options.
 * The `.action()` is attached so CLI behaviour is preserved when this command
 * is added to the root program. Tests only need `.options` — they never call
 * `.action()`.
 */
export function buildInitCommand(): Command {
  return new Command('init')
    .description('Initialize Anvil in the current project (interactive TUI)')
    .option('--yes', 'skip prompts, use defaults')
    .option('--target <target>', 'claude-code | opencode | both', 'both')
    .option('--scope <scope>', 'project | global', 'project')
    .option(
      '--preset <preset>',
      'balanced | cost-optimised | max-quality | speed-first',
      'balanced',
    )
    .option('--dry-run', 'print the plan without executing')
    .option(
      '--diff',
      'show a unified diff of what would change without writing',
    )
    .option(
      '--claude <yes|no>',
      'install the Claude Code adapter (overrides --target)',
    )
    .option(
      '--opencode <yes|no>',
      'install the OpenCode adapter (overrides --target)',
    )
    .option('--statusline', 'enable Claude Code status line integration')
    .option('--cli', 'symlink `anvil` into ~/.local/bin')
    .option(
      '--headless',
      'skip the interactive TUI even when stdin is a TTY (CI-friendly)',
    )
    .option('--no-tui', 'alias for --headless')
    .option('--json', 'emit JSON output (use with --diff or --headless)')
    .option(
      '--allow-cross-target',
      'bypass adapter cross-contamination guard (ANV-0060)',
    )
    .option(
      '--allow-large-bundle',
      'suppress the cumulative expected_tokens warning when the bundle exceeds the threshold (ANV-0114)',
    )
    .action(async (opts) => {
      const { initCommand } = await import('./init.js')
      await initCommand(opts)
    })
}
