import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Slash → CLI subcommand map
// ---------------------------------------------------------------------------

/**
 * Slash commands that map to a CLI subcommand file rather than a top-level
 * CLI file of the same name. Any slash not listed here is expected to have a
 * matching `<name>.ts` at the top level of the CLI commands directory.
 *
 * This is the single source of truth used by both the integration test and
 * the `anvil doctor` runtime check.
 */
export const SUBCOMMAND_SLASHES: Record<string, string> = {
  'anvil-init': 'init.ts',
  'new-skill': 'skill.ts',
  'select-skill': 'skill.ts',
  skill: 'skill.ts',
  // 'skill-eval' — moved to scripts/dev/skill-eval.ts (ANV-0182); slash removed
  // ANV-0090 — pin/unpin sub-commands map to skill.ts
  'skill-pin': 'skill.ts',
  'skill-unpin': 'skill.ts',
  'skill-search': 'skill.ts',
  'plan-audit': 'plan.ts',
  'plan-validate-coverage': 'plan-validate-coverage.ts',
  'plan-check-decisions': 'plan-check-decisions.ts',
  // ANV-0247: notepad CLI surface moved to src/experimental/; removed from SUBCOMMAND_SLASHES.
  // Both now live in SLASH_ONLY_COMMANDS below (no default-build CLI counterpart).
  // Plan 33 E1 — statusline install subcommand maps to statusline-install.ts
  'statusline-install': 'statusline-install.ts',
  // Plan 34 A5 — statusline template subcommand maps to statusline-template.ts
  'statusline-template': 'statusline-template.ts',
  // ANV-0155 — worktree subcommands moved to scripts/dev/worktree.ts (ANV-0182); slashes removed
  // ANV-0183 — skill/agent/hook lint subcommands
  'skill-lint': 'skill-lint.ts',
  'agent-lint': 'agent-lint.ts',
  'hook-lint': 'hook-lint.ts',
  // ANV-0199 — projects list/show subcommands map to projects.ts
  'projects-list': 'projects.ts',
  'projects-show': 'projects.ts',
  // ANV-0203 (P4) — extension install/list/uninstall subcommands (in subdirectory)
  // ANV-0248: extension CLI surface moved to src/experimental/; removed from SUBCOMMAND_SLASHES.
  // ANV-0246: catalog CLI surface moved to src/experimental/; removed from SUBCOMMAND_SLASHES.
  // Both now live in SLASH_ONLY_COMMANDS below (no default-build CLI counterpart).
}

/**
 * Slash commands that intentionally ship without a direct CLI counterpart.
 * These are exempt from the parity check — both the missing-cli and
 * missing-invocation checks skip any slash whose stem is in this set.
 *
 * Plan 34 B1. Justification per entry:
 *   agents — dispatches the orchestrator sub-agent via CC's Task() tool;
 *             the CLI `agents.ts` exists but is not a 1-to-1 slash→CLI
 *             mapping. When running from the installed bundle the parity check
 *             cannot resolve the repo src/ path, causing false-positive
 *             "missing-cli" failures for every installed slash. Pre-committed
 *             decision (Plan 34 B1): exclude from parity check.
 *   extension-install, extension-list, extension-uninstall — ANV-0248: the
 *             `anvil extension *` CLI surface moved to src/experimental/extensions/cli/.
 *             It is only available in the experimental build; the slash commands
 *             remain in the default build but no default-build CLI directory
 *             backs them. Exempted from parity check (experimental-only CLI surface).
 */
export const SLASH_ONLY_COMMANDS = new Set<string>([
  'agents',
  'extension-install',
  'extension-list',
  'extension-uninstall',
  // ANV-0246: catalog CLI moved to experimental build; the /catalog slash command
  // remains but there is no default-build src/commands/cli/catalog.ts backing it.
  'catalog',
  // ANV-0247: notepads/note CLI moved to experimental build; slash commands remain
  // in src/commands/slash/ but there is no default-build CLI backing them.
  'anvil-notepad-read',
  'anvil-notepad-write',
  'note',
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParityIssue {
  /** Filename of the slash .md (e.g. "debug.md") */
  slash: string
  kind: 'missing-cli' | 'missing-invocation'
  detail: string
}

export interface ParityReport {
  checkedSlashCount: number
  issues: ParityIssue[]
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Audits CLI ↔ slash command parity.
 *
 * For every `.md` file found in `slashDir`:
 *   (a) checks that a matching CLI file exists in `cliDir`
 *   (b) checks that the slash body references `anvil ` (i.e. `anvil <cmd>`)
 *
 * Slashes whose stem is in {@link SLASH_ONLY_COMMANDS} are fully exempt from
 * both checks (a) and (b).
 *
 * Returns a {@link ParityReport} with an empty `issues` array when parity is
 * fully intact.
 *
 * The helper is intentionally pure — it has no global state and does not call
 * `process.cwd()`. All paths must be supplied by the caller.
 *
 * @param opts.slashDir  Absolute path to the directory containing slash .md files.
 * @param opts.cliDir    Absolute path to the directory containing CLI .ts files.
 * @param opts.subcommandMap  Optional override for the slash→CLI map. Defaults
 *                            to the shipped {@link SUBCOMMAND_SLASHES}.
 * @param opts.slashOnlyCommands  Optional override for the exclusion set. Defaults
 *                                to the shipped {@link SLASH_ONLY_COMMANDS}.
 */
export async function auditCliSlashParity(opts: {
  slashDir: string
  cliDir: string
  subcommandMap?: Record<string, string>
  slashOnlyCommands?: Set<string>
}): Promise<ParityReport> {
  const { slashDir, cliDir } = opts
  const subcommandMap = opts.subcommandMap ?? SUBCOMMAND_SLASHES
  const slashOnlyCommands = opts.slashOnlyCommands ?? SLASH_ONLY_COMMANDS

  const issues: ParityIssue[] = []

  let slashFiles: string[]
  try {
    slashFiles = (await readdir(slashDir)).filter((f) => f.endsWith('.md'))
  } catch {
    // slashDir doesn't exist — treat as zero slashes checked (caller decides)
    return { checkedSlashCount: 0, issues: [] }
  }

  let cliFiles: Set<string>
  try {
    cliFiles = new Set(await readdir(cliDir))
  } catch {
    cliFiles = new Set()
  }

  for (const slashFile of slashFiles) {
    const name = slashFile.replace('.md', '')

    // Skip slash-only commands entirely — no CLI counterpart required.
    if (slashOnlyCommands.has(name)) {
      continue
    }

    const expectedCli = subcommandMap[name] ?? `${name}.ts`

    // (a) Check matching CLI file exists. When the cliDir contains compiled
    // .js files (installed runtime), also accept the .js variant.
    const expectedCliJs = expectedCli.replace(/\.ts$/, '.js')
    const cliExists = cliFiles.has(expectedCli) || cliFiles.has(expectedCliJs)
    if (!cliExists) {
      issues.push({
        slash: slashFile,
        kind: 'missing-cli',
        detail: `/${name} has no CLI counterpart; expected ${expectedCli}`,
      })
      // No point checking (b) if the CLI file is missing
      continue
    }

    // (b) Check slash body references `anvil `
    let raw: string
    try {
      raw = await readFile(join(slashDir, slashFile), 'utf-8')
    } catch {
      // Unreadable — skip invocation check
      continue
    }
    if (!raw.includes('anvil ')) {
      issues.push({
        slash: slashFile,
        kind: 'missing-invocation',
        detail: `/${name} body does not reference \`anvil <cmd>\``,
      })
    }
  }

  return { checkedSlashCount: slashFiles.length, issues }
}
