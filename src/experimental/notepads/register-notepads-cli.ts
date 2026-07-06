/**
 * ANV-0247 — Notepads CLI registration.
 *
 * Wires `anvil note *` and `anvil notepad *` sub-commands onto the root program.
 * Called from src/experimental/register-cli.ts — only active in the
 * experimental build.
 *
 * Default build: this file is excluded (src/experimental/** is excluded from
 * tsconfig.json). `anvil note` and `anvil notepad` emit stub gate messages in
 * the default build (registered in src/index.ts).
 */

import type { Command } from 'commander'

/**
 * Register `anvil note` and `anvil notepad *` onto the given root program.
 *
 * Removes the default-build stub commands first (if present), then registers
 * the real subcommands.
 */
export function registerNotepadsCommands(program: Command): void {
  // Remove the stub gate commands registered by the default build.
  // Commander does not expose removeCommand(); cast through unknown to mutate.
  const cmds = program.commands as unknown as Command[]
  for (const name of ['note', 'notepad']) {
    const existingIdx = cmds.findIndex((c) => c.name() === name)
    if (existingIdx !== -1) {
      cmds.splice(existingIdx, 1)
    }
  }

  program
    .command('note [args...]')
    .description(
      'Zero-friction idea capture: "anvil note <text>" | "anvil note list" | "anvil note promote <file>" [experimental]',
    )
    .action(async (args: string[]) => {
      const { noteCommand } = await import('./cli/note.js')
      await noteCommand({ args })
    })

  program
    .command('notepad [args...]')
    .description(
      'Per-branch token-bounded breadcrumb system: init | read | write | list | clean | validate | compact | archive | restore [experimental]',
    )
    .action(async (args: string[]) => {
      const { notepadsCommand } = await import('./cli/notepad.js')
      await notepadsCommand({ args })
    })
}
