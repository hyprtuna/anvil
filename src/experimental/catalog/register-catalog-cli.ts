/**
 * ANV-0246 — Catalog CLI registration.
 *
 * Wires `anvil catalog *` sub-commands onto the root program.
 * Called from src/experimental/register-cli.ts — only active in the
 * experimental build.
 *
 * Default build: this file is excluded (src/experimental/** is excluded from
 * tsconfig.json). `anvil catalog --help` produces only the stub gate message
 * in the default build.
 */

import type { Command } from 'commander'

/**
 * Register `anvil catalog list-sources|refresh|search|list|show|fetch|status|promote|drop`
 * onto the given root program.
 *
 * Removes the default-build stub command first (if present), then registers
 * the real subcommands.
 */
export function registerCatalogCommands(program: Command): void {
  // Remove the stub gate command registered by the default build.
  // Commander does not expose removeCommand(); cast through unknown to mutate.
  const cmds = program.commands as unknown as Command[]
  const existingIdx = cmds.findIndex((c) => c.name() === 'catalog')
  if (existingIdx !== -1) {
    cmds.splice(existingIdx, 1)
  }

  const catalogCmd = program
    .command('catalog')
    .description(
      'Discover, fetch, and promote extensions from remote catalogs [experimental]',
    )

  catalogCmd
    .command('list-sources')
    .description('Show configured catalog sources (bundled + user)')
    .option('--json', 'emit JSON output')
    .action(async (opts: { json?: boolean }) => {
      const { listSourcesCommand } = await import('./cli/list-sources.js')
      const code = await listSourcesCommand({ json: opts.json })
      process.exit(code)
    })

  catalogCmd
    .command('refresh')
    .description('Re-fetch catalog indices from sources')
    .option('--source <id>', 'restrict to a single source')
    .option('--json', 'emit JSON output')
    .action(async (opts: { source?: string; json?: boolean }) => {
      const { refreshCommand } = await import('./cli/refresh.js')
      const code = await refreshCommand({
        source: opts.source,
        json: opts.json,
      })
      process.exit(code)
    })

  catalogCmd
    .command('search <query>')
    .description('Full-text search across cached catalog indices')
    .option('--source <id>', 'restrict to a single source')
    .option(
      '--kind <kind>',
      'filter by declared kind (extension|preset|profile)',
    )
    .option('--json', 'emit JSON output')
    .action(
      async (
        query: string,
        opts: { source?: string; kind?: string; json?: boolean },
      ) => {
        const { searchCommand } = await import('./cli/search.js')
        const code = await searchCommand(query, {
          source: opts.source,
          kind: opts.kind,
          json: opts.json,
        })
        process.exit(code)
      },
    )

  catalogCmd
    .command('list')
    .description('List cached entries grouped by source')
    .option('--source <id>', 'restrict to a single source')
    .option('--json', 'emit JSON output')
    .action(async (opts: { source?: string; json?: boolean }) => {
      const { listCatalogCommand } = await import('./cli/list.js')
      const code = await listCatalogCommand({
        source: opts.source,
        json: opts.json,
      })
      process.exit(code)
    })

  catalogCmd
    .command('show <source-slug>')
    .description('Show a single catalog entry (format: source:slug)')
    .option('--json', 'emit JSON output')
    .action(async (sourceSlug: string, opts: { json?: boolean }) => {
      const { showCommand } = await import('./cli/show.js')
      const code = await showCommand(sourceSlug, { json: opts.json })
      process.exit(code)
    })

  catalogCmd
    .command('fetch <source-slug>')
    .description(
      'Download a catalog entry into quarantine (format: source:slug). Does NOT promote.',
    )
    .option('--json', 'emit JSON output')
    .action(async (sourceSlug: string, opts: { json?: boolean }) => {
      const { fetchCommand } = await import('./cli/fetch.js')
      const code = await fetchCommand(sourceSlug, { json: opts.json })
      process.exit(code)
    })

  catalogCmd
    .command('status')
    .description('Show all quarantined entries and their validation results')
    .option('--json', 'emit JSON output')
    .action(async (opts: { json?: boolean }) => {
      const { statusCommand } = await import('./cli/status.js')
      const code = await statusCommand({ json: opts.json })
      process.exit(code)
    })

  catalogCmd
    .command('promote <quarantine-id>')
    .description(
      'Run validators and promote a quarantined entry to ~/.anvil/extensions/',
    )
    .option(
      '--accept-warnings',
      'promote even when warn-severity validators have failed',
    )
    .option('--json', 'emit JSON output (PromotionResult)')
    .action(
      async (
        quarantineId: string,
        opts: { acceptWarnings?: boolean; json?: boolean },
      ) => {
        const { promoteCommand } = await import('./cli/promote.js')
        const code = await promoteCommand(quarantineId, {
          acceptWarnings: opts.acceptWarnings,
          json: opts.json,
        })
        process.exit(code)
      },
    )

  catalogCmd
    .command('drop <quarantine-id>')
    .description('Remove a quarantined entry without promoting')
    .option('--json', 'emit JSON output')
    .action(async (quarantineId: string, opts: { json?: boolean }) => {
      const { dropCommand } = await import('./cli/drop.js')
      const code = await dropCommand(quarantineId, { json: opts.json })
      process.exit(code)
    })
}
