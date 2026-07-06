/**
 * Regression guard: every `anvil init` CLI flag must have a documented TUI
 * disposition in TUI_FLAG_COVERAGE, and every entry in TUI_FLAG_COVERAGE must
 * correspond to a real init flag.
 *
 * When a flag is added to buildInitCommand() without a corresponding entry
 * here, the first test fails. When a stale entry exists, the second test fails.
 *
 * See spec D-02.
 */
import { describe, expect, it } from 'vitest'
import { buildInitCommand } from '../../../src/commands/cli/init-command.js'
import { TUI_FLAG_COVERAGE } from '../../../src/tui/flag-coverage.js'

function collectFlagNames(): string[] {
  const cmd = buildInitCommand()
  return cmd.options
    .map((opt) => opt.long?.replace(/^--/, '') ?? '')
    .filter(Boolean)
}

describe('TUI flag coverage regression guard', () => {
  it('every init flag has a TUI disposition', () => {
    const flagNames = collectFlagNames()
    for (const f of flagNames) {
      expect(
        TUI_FLAG_COVERAGE,
        `Flag "--${f}" is missing from TUI_FLAG_COVERAGE`,
      ).toHaveProperty(f)
    }
  })

  it('every TUI_FLAG_COVERAGE entry is a real init flag', () => {
    const flagNames = collectFlagNames()
    for (const k of Object.keys(TUI_FLAG_COVERAGE)) {
      expect(
        flagNames,
        `TUI_FLAG_COVERAGE has stale entry "${k}" — no matching init flag`,
      ).toContain(k)
    }
  })
})
