/**
 * ANV-0248 — Extension CLI registration.
 *
 * Wires `anvil extension *` sub-commands onto the root program.
 * Called from src/experimental/register-cli.ts — only active in the
 * experimental build.
 *
 * Default build: this file is excluded (src/experimental/** is excluded from
 * tsconfig.json). `anvil extension --help` does not exist in the default build.
 */

import type { Command } from 'commander'

/**
 * Register `anvil extension install|list|uninstall` onto the given root program.
 *
 * Mirrors the command structure previously defined in src/index.ts for these
 * commands (removed from the default build by ANV-0248).
 */
export function registerExtensionCommands(program: Command): void {
  const extensionCmd = program
    .command('extension')
    .description(
      'Manage installed Anvil extensions (~/.anvil/extensions/) [experimental]',
    )

  extensionCmd
    .command('install <source>')
    .description(
      'Install an extension from a local directory or archive (.tar.gz/.tgz/.zip)',
    )
    .option(
      '--on-collision <strategy>',
      'collision resolution strategy (skip|abort|fail|replace|rename)',
    )
    .option(
      '--rename <new-name>',
      'new name for the extension (requires --on-collision=rename)',
    )
    .option(
      '--yes',
      'skip prompts; defaults to abort on collision when --on-collision absent',
    )
    .option('--json', 'emit JSON output')
    .action(
      async (
        source: string,
        opts: {
          onCollision?: string
          rename?: string
          yes?: boolean
          json?: boolean
        },
      ) => {
        const { installExtensionCommand } = await import('./cli/install.js')
        const code = await installExtensionCommand(source, {
          onCollision: opts.onCollision as Parameters<
            typeof installExtensionCommand
          >[1]['onCollision'],
          rename: opts.rename,
          yes: opts.yes,
          json: opts.json,
        })
        process.exit(code)
      },
    )

  extensionCmd
    .command('list')
    .description('List all installed extensions')
    .option('--json', 'emit JSON output (full Registry object)')
    .option(
      '--verbose',
      'show source, install date, and manifest schema_version',
    )
    .action(async (opts: { json?: boolean; verbose?: boolean }) => {
      const { listExtensionsCommand } = await import('./cli/list.js')
      const code = await listExtensionsCommand({
        json: opts.json,
        verbose: opts.verbose,
      })
      process.exit(code)
    })

  extensionCmd
    .command('uninstall <name>')
    .description('Uninstall an installed extension by name')
    .option('--force', 'remove even if other extensions depend on it')
    .option('--json', 'emit JSON output')
    .action(async (name: string, opts: { force?: boolean; json?: boolean }) => {
      const { uninstallExtensionCommand } = await import('./cli/uninstall.js')
      const code = await uninstallExtensionCommand(name, {
        force: opts.force,
        json: opts.json,
      })
      process.exit(code)
    })
}
