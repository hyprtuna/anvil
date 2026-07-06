/**
 * Canonical mapping of every `anvil init` CLI flag to its TUI disposition.
 *
 * This file is the single source of truth for D-01/D-02/D-05 compliance.
 * The regression guard test at tests/unit/tui/flag-coverage.test.ts
 * cross-references this constant against the live commander option list.
 */

export type FlagDisposition =
  | { kind: 'bypass' }
  | { kind: 'pre-seed'; screen: string }
  | { kind: 'informational'; screen: string }
  | { kind: 'derived'; screen: string }

/**
 * TUI disposition for every `anvil init` flag (D-05).
 * Key = commander option long name (without leading `--`).
 */
export const TUI_FLAG_COVERAGE: Record<string, FlagDisposition> = {
  yes: { kind: 'bypass' },
  target: { kind: 'pre-seed', screen: 'target' },
  scope: { kind: 'pre-seed', screen: 'scope' },
  preset: { kind: 'pre-seed', screen: 'models' },
  'dry-run': { kind: 'pre-seed', screen: 'preview' },
  diff: { kind: 'bypass' },
  claude: { kind: 'pre-seed', screen: 'target' },
  opencode: { kind: 'pre-seed', screen: 'target' },
  statusline: { kind: 'pre-seed', screen: 'statusline' },
  cli: { kind: 'pre-seed', screen: 'cli' },
  headless: { kind: 'bypass' },
  'no-tui': { kind: 'bypass' },
  json: { kind: 'bypass' },
  'allow-cross-target': { kind: 'bypass' },
  // ANV-0114 — suppresses the cumulative expected_tokens warning. Treated as
  // a bypass flag (no dedicated TUI screen) because the budget summary is
  // rendered informationally on every install path.
  'allow-large-bundle': { kind: 'bypass' },
}

/** Screens that are informational-only (no corresponding CLI flag). */
export const TUI_INFORMATIONAL_SCREENS = ['welcome', 'languages'] as const
