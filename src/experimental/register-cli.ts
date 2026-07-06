/**
 * Experimental CLI registration entry point.
 *
 * This file is dynamically imported by `src/index.ts` via:
 *   await import('./experimental/register-cli.js')
 * with a try/catch fallback that registers stubs when the experimental build
 * is not installed.
 *
 * ANV-0248: registers `anvil extension *` commands when the experimental
 * build is active.
 * ANV-0247: registers `anvil note` and `anvil notepad *` when the experimental
 * build is active.
 */

import type { Command } from 'commander'
import { registerCatalogCommands } from './catalog/register-catalog-cli.js'
import { registerExtensionCommands } from './extensions/register-extension-cli.js'
import { registerNotepadsCommands } from './notepads/register-notepads-cli.js'

/**
 * Register experimental CLI subcommands onto the given root program.
 *
 * ANV-0248: `anvil extension *` is gated here — only appears when the
 * experimental build is installed.
 * ANV-0246: `anvil catalog *` is gated here — only appears when the
 * experimental build is installed.
 * ANV-0247: `anvil note` and `anvil notepad *` are gated here — only appear
 * when the experimental build is installed.
 */
export function registerExperimentalCommands(program: Command): void {
  registerExtensionCommands(program)
  registerCatalogCommands(program)
  registerNotepadsCommands(program)
}
