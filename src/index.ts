#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { buildInitCommand } from './commands/cli/init-command.js'
import { EffortLevel } from './core/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = join(__dirname, '..', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
  version: string
  description: string
}

const program = new Command()
program
  .name('anvil')
  .description(pkg.description)
  .version(pkg.version, '-V, --version')
  .option(
    '--output <fmt>',
    "global output format: 'text' (default) or 'json'. " +
      'When json, every command that produces a result emits JSON ' +
      '(equivalent to per-command --json where supported).',
    'text',
  )
  .option(
    '--model <id>',
    'override the resolved model for this invocation (alias or model ID). ' +
      'Sets ANVIL_MODEL so the resolver picks it up via the ENV layer.',
  )
  .option(
    '--effort <level>',
    `override the resolved effort for this invocation. One of: ${EffortLevel.options.join(', ')}. Sets ANVIL_EFFORT so the resolver picks it up via the ENV layer.`,
  )
  .option(
    '--eager',
    'force eager skill loading regardless of models.json skills.lazy_load setting. ' +
      'Use with `anvil doctor` to measure lazy-vs-eager savings.',
  )
  .hook('preAction', (thisCommand) => {
    const globals = thisCommand.optsWithGlobals()
    const fmt = globals.output as unknown
    if (fmt !== 'text' && fmt !== 'json') {
      process.stderr.write(`Invalid --output: must be 'text' or 'json'\n`)
      process.exit(1)
    }
    // Propagate to all subcommands via env so the shared maybeEmitJson helper
    // (src/commands/cli/common/json-mode.ts) can pick it up without each
    // command re-threading the flag.
    process.env.ANVIL_OUTPUT_FORMAT = fmt === 'json' ? 'json' : 'text'

    // Plan 28 E2 — global --model / --effort flags. Set the ANVIL_MODEL /
    // ANVIL_EFFORT env vars so the existing 5-layer resolver picks them up
    // through its ENV layer (no resolver signature change).
    const modelOpt = globals.model as unknown
    if (typeof modelOpt === 'string' && modelOpt.length > 0) {
      process.env.ANVIL_MODEL = modelOpt
    }
    const effortOpt = globals.effort as unknown
    if (typeof effortOpt === 'string' && effortOpt.length > 0) {
      const parsed = EffortLevel.safeParse(effortOpt)
      if (!parsed.success) {
        process.stderr.write(
          `Invalid --effort: ${JSON.stringify(effortOpt)}. ` +
            `Expected one of: ${EffortLevel.options.join(', ')}\n`,
        )
        process.exit(1)
      }
      process.env.ANVIL_EFFORT = parsed.data
    }

    // Plan 32 B7 — global --eager flag. Forces eager loading regardless of
    // models.json skills.lazy_load. Useful for measuring lazy-vs-eager delta.
    const eagerOpt = globals.eager as unknown
    if (eagerOpt === true) {
      process.env.ANVIL_EAGER = '1'
    }
  })

// Lifecycle — init command built via buildInitCommand() for testability (D-01/D-02).
program.addCommand(buildInitCommand())

program
  .command('doctor')
  .description('Diagnose the installation')
  .option('--json', 'emit JSON output')
  .option('--fix', 'auto-repair common misconfigurations')
  .option(
    '--dry-run',
    'with --fix, print remediation commands without executing',
  )
  .option(
    '--live',
    'run live skill-triggering eval per user-invocable skill (requires ANVIL_LIVE_EVAL=1)',
  )
  .option(
    '--strict',
    'fail (exit 1) on count-drift: README counts, user-invocable cap, stale self-audit (ANV-0087)',
  )
  .option(
    '--tier <level>',
    'run level: quick (or --smoke) | standard (default) | deep | diagnostic-dump',
  )
  .option(
    '--smoke',
    'alias for --tier quick: run only pure in-memory checks (<2s budget)',
  )
  .option(
    '-v, --verbose',
    'show all rows (pass + expected skips); default is quiet mode',
  )
  .option(
    '--scope <scope>',
    'override detected install scope: auto (default) | global | project | both | unknown',
    'auto',
  )
  .option(
    '--show-migration',
    'disable migration-window suppression; always show bulk-metadata warn rows (ANV-0149)',
  )
  .option(
    '--catalog',
    'ANV-0091: restrict output to catalog rows only (catalog-quarantine-state + catalog-cache-health)',
  )
  .action(async (opts) => {
    const { doctorCommand } = await import('./commands/cli/doctor.js')
    await doctorCommand(opts)
  })

program
  .command('upgrade')
  .description('Upgrade Anvil installation in place')
  .option('--dry-run', 'preview the upgrade without writing files')
  .option('--json', 'emit the dry-run plan as JSON (implies --dry-run output)')
  .action(async (opts) => {
    const { upgradeCommand } = await import('./commands/cli/upgrade.js')
    await upgradeCommand(opts)
  })

program
  .command('uninstall')
  .description('Remove Anvil from this project or globally')
  .option('--scope <scope>', 'project | global', 'project')
  .option('--yes', 'skip confirmation')
  .option('--dry-run', 'list paths that would be removed without removing them')
  .option('--json', 'emit the dry-run plan as JSON (use with --dry-run)')
  .option(
    '--archive',
    'archive ~/.anvil/ (excluding cache/) to ~/.anvil-backups/<ts>.tgz before removing (keeps last 5)',
  )
  .action(async (opts) => {
    const { uninstallCommand } = await import('./commands/cli/uninstall.js')
    await uninstallCommand(opts)
  })

// Statusline (Plan 28 Phase C)
const statuslineCmd = program
  .command('statusline')
  .description(
    'Render the Claude Code statusline. Reads JSON on stdin (the contract documented at https://docs.anthropic.com/en/docs/claude-code/statusline) and emits one line.',
  )
  .option(
    '--tier <tier>',
    'minimal | default | maximal (overrides models.json)',
  )
  .action(async (opts) => {
    const { statuslineCommand } = await import('./commands/cli/statusline.js')
    await statuslineCommand(opts)
  })
// Plan 33 E1 — full-featured install subcommand (scope-agnostic)
statuslineCmd
  .command('install')
  .description(
    'Wire the Anvil statusline into Claude Code settings.json. ' +
      'Supports --scope global|project and --mode anvil|shell-script.',
  )
  .option(
    '--scope <scope>',
    'target scope: global (default, ~/.claude/settings.json) or project (<cwd>/.claude/settings.json)',
    'global',
  )
  .option(
    '--mode <mode>',
    'anvil (default, TS renderer) or shell-script (copies templates/statusline.sh)',
    'anvil',
  )
  .option('--force', 'overwrite an existing custom statusLine command')
  .option('--json', 'emit machine-readable JSON output')
  .action(
    async (opts: {
      scope?: string
      mode?: string
      force?: boolean
      json?: boolean
    }) => {
      const scope =
        opts.scope === 'global' || opts.scope === 'project'
          ? opts.scope
          : 'global'
      const mode =
        opts.mode === 'shell-script' || opts.mode === 'anvil'
          ? opts.mode
          : 'anvil'
      const { statuslineInstallCommand } = await import(
        './commands/cli/statusline-install.js'
      )
      await statuslineInstallCommand({
        scope,
        mode,
        force: opts.force,
        json: opts.json,
      })
    },
  )
statuslineCmd
  .command('subagent')
  .description(
    'Render one {id,content} JSON line per active subagent task. Reads CC subagent payload from stdin; emits newline-delimited JSON. Wired via subagentStatusLine.command when models.json → statusline.show_subagent_panel is true.',
  )
  .action(async () => {
    const { statuslineSubagentCommand } = await import(
      './commands/cli/statusline.js'
    )
    await statuslineSubagentCommand()
  })
// Plan 32 A4 — tier subcommand
statuslineCmd
  .command('tier [tier]')
  .description(
    'Read or set the active statusline display tier (minimal | default | maximal). ' +
      'No arg → print current tier. With a tier arg → write to ~/.anvil/models.json.',
  )
  .option('--json', 'emit machine-readable JSON output')
  .action(async (tier: string | undefined, opts: { json?: boolean }) => {
    const { statuslineTierCommand } = await import(
      './commands/cli/statusline-tier.js'
    )
    await statuslineTierCommand({ tier, ...opts })
  })
// Plan 34 A5 — template subcommand
statuslineCmd
  .command('template [template]')
  .description(
    'Read or set the active statusline rendering template (simple | rich). ' +
      'No arg → print current template. With a template arg → write to ~/.anvil/models.json.',
  )
  .option('--json', 'emit machine-readable JSON output')
  .action(async (template: string | undefined, opts: { json?: boolean }) => {
    const { statuslineTemplateCommand } = await import(
      './commands/cli/statusline-template.js'
    )
    await statuslineTemplateCommand({ template, ...opts })
  })

// Models
const modelsCmd = program
  .command('models')
  .description('Manage model and effort configuration')
modelsCmd
  .command('list')
  .description('Show every skill with its resolved model')
  .option('--json', 'emit JSON')
  .action(async (opts) =>
    (await import('./commands/cli/models.js')).modelsListCommand(opts),
  )
modelsCmd
  .command('show <skill>')
  .description('Show full resolution trace for one skill')
  .option('--json', 'emit JSON')
  .action(async (skill, opts) =>
    (await import('./commands/cli/models.js')).modelsShowCommand(skill, opts),
  )
modelsCmd
  .command('set <skill>')
  .description('Set per-skill override')
  .requiredOption('--model <model>', 'model ID or alias')
  .option('--effort <effort>', 'low | normal | high | max')
  .option('--max-tokens <n>', 'max tokens', Number.parseInt)
  .action(async (skill, opts) =>
    (await import('./commands/cli/models.js')).modelsSetCommand(skill, opts),
  )
modelsCmd
  .command('set-group <group>')
  .description('Update a whole group')
  .requiredOption('--model <model>', 'model ID or alias')
  .option('--effort <effort>', 'low | normal | high | max')
  .action(async (group, opts) =>
    (await import('./commands/cli/models.js')).modelsSetGroupCommand(
      group,
      opts,
    ),
  )
modelsCmd
  .command('use <preset>')
  .description('Apply a preset')
  .action(async (preset) =>
    (await import('./commands/cli/models.js')).modelsUseCommand(preset),
  )
modelsCmd
  .command('reset')
  .description('Restore defaults')
  .option('--yes', 'skip confirmation')
  .action(async (opts) =>
    (await import('./commands/cli/models.js')).modelsResetCommand(opts),
  )
modelsCmd
  .command('validate')
  .description('Check models.json for schema violations')
  .action(async () =>
    (await import('./commands/cli/models.js')).modelsValidateCommand(),
  )

// Session model override (Plan 30 G1)
program
  .command('model [model]')
  .description(
    'Set or show the session-scoped model override. ' +
      'With no argument prints the current override and resolved model. ' +
      'With a model ID or alias, writes .anvil/active-model.json (cwd-scoped).',
  )
  .option(
    '-e, --effort <level>',
    `effort level: ${EffortLevel.options.join(', ')}`,
  )
  .action(async (model, opts) => {
    const { modelCommand } = await import('./commands/cli/model.js')
    await modelCommand(model, opts)
  })

// Settings (Plan 28 Phase G2/G3)
const settingsCmd = program
  .command('settings')
  .description('Inspect and validate `.claude/settings.json`')
settingsCmd
  .command('show')
  .description('Print the merged Claude Code settings (project > user) as JSON')
  .option('--json', 'emit JSON (always JSON; this flag suppresses headers)')
  .action(async (opts) =>
    (await import('./commands/cli/settings.js')).settingsShowCommand(opts),
  )
settingsCmd
  .command('validate')
  .description(
    'Validate `.claude/settings.json` against the Anvil settings schema',
  )
  .option('--user', 'validate ~/.claude/settings.json instead of project')
  .option('--json', 'emit JSON')
  .action(async (opts) =>
    (await import('./commands/cli/settings.js')).settingsValidateCommand(opts),
  )

// Hooks (Plan 28 Phase D6)
const hooksCmd = program
  .command('hooks')
  .description('Inspect the registered hook inventory')
hooksCmd
  .command('list')
  .description('List registered hooks (NAME · KIND · ENABLED · PRIORITY)')
  .option('--kind <kind>', 'filter by hook kind (e.g. pre-tool-use)')
  .option('--json', 'emit JSON')
  .action(async (opts) =>
    (await import('./commands/cli/hooks.js')).hooksListCommand(opts),
  )

// Skills
const skillCmd = program
  .command('skill')
  .description('Manage and inspect skills')
skillCmd
  .command('list')
  .description('List user-invocable skills (use --include-hidden for all)')
  .option('--language <lang>', 'filter by language')
  .option('--group <group>', 'filter by group')
  .option('--json', 'emit JSON')
  .option('--all', 'include hidden skills (legacy alias for --include-hidden)')
  .option('--include-hidden', 'include user-invocable:false skills')
  .option('--verbose', 'show provenance columns (Source, Conf)')
  // ANV-0096 — restrict listing to a pack namespace.
  .option('--pack <name>', "filter to a pack (use 'anvil' for bundled)")
  .action(async (opts) =>
    (await import('./commands/cli/skill.js')).skillListCommand(opts),
  )
skillCmd
  .command('validate <name>')
  .description('Validate a skill file')
  .action(async (name) =>
    (await import('./commands/cli/skill.js')).skillValidateCommand(name),
  )
skillCmd
  .command('enable <name>')
  .description('Enable a skill')
  .action(async (name) =>
    (await import('./commands/cli/skill.js')).skillEnableCommand(name),
  )
skillCmd
  .command('disable <name>')
  .description('Disable a skill')
  .action(async (name) =>
    (await import('./commands/cli/skill.js')).skillDisableCommand(name),
  )
skillCmd
  .command('reload')
  .description('Reload skills from disk')
  .action(async () =>
    (await import('./commands/cli/skill.js')).skillReloadCommand(),
  )
// ANV-0090 — Pin/unpin sub-commands. Pins live in ~/.anvil/pins.json and
// surface in the `anvil skill list` Pinned section.
skillCmd
  .command('pin <name>')
  .description('Pin a skill so it surfaces in the slash menu Pinned section')
  .action(async (name) =>
    (await import('./commands/cli/skill.js')).skillPinCommand(name),
  )
skillCmd
  .command('unpin <name>')
  .description('Unpin a skill')
  .action(async (name) =>
    (await import('./commands/cli/skill.js')).skillUnpinCommand(name),
  )
skillCmd
  .command('create <name>')
  .description('Scaffold a new skill')
  .option('--group <group>', 'skill group', 'development')
  .option('--language <lang>', 'language overlay target', 'universal')
  .action(async (name, opts) =>
    (await import('./commands/cli/skill.js')).skillCreateCommand(name, opts),
  )
skillCmd
  .command('run <name>')
  .description("Render a skill's prompt + resolved model")
  .argument('[args...]', 'extra prompt arguments')
  .option(
    '--input-stdin',
    'read stdin as input; for the summarization skill, produce a plain-text ≤200-word summary',
  )
  .action(async (name, args, opts) =>
    (await import('./commands/cli/skill.js')).skillRunCommand(name, args, opts),
  )
skillCmd
  .command('select')
  .description('Run the skill-selection against a prompt')
  .argument('<prompt...>', 'the prompt to route')
  .option('--json', 'emit JSON')
  .action(async (promptParts, opts) =>
    (await import('./commands/cli/skill.js')).skillSelectCommand(
      promptParts.join(' '),
      opts,
    ),
  )
skillCmd
  .command('search <query>')
  .description('Search skills by name, description, trigger, or tag')
  .option('--json', 'emit JSON')
  .action(async (query, opts) =>
    (await import('./commands/cli/skill.js')).skillSearchCommand(query, opts),
  )
skillCmd
  .command('lint')
  .description(
    'Lint skills in project .claude/skills, ~/.anvil/skills, or --target',
  )
  .option(
    '--target <path>',
    'explicit directory to lint instead of auto-resolved roots',
  )
  .option('--json', 'emit JSON output')
  .option('--strict', 'treat warnings as failures (for CI use)')
  .action(async (opts) =>
    (await import('./commands/cli/skill-lint.js')).skillLintCommand(opts),
  )

// Agent management commands
const agentCmd = program
  .command('agent')
  .description('Manage and inspect agents')
agentCmd
  .command('lint')
  .description(
    'Lint agents in project .claude/agents, ~/.anvil/agents, or --target',
  )
  .option(
    '--target <path>',
    'explicit directory to lint instead of auto-resolved roots',
  )
  .option('--json', 'emit JSON output')
  .option('--strict', 'treat warnings as failures (for CI use)')
  .action(async (opts) =>
    (await import('./commands/cli/agent-lint.js')).agentLintCommand(opts),
  )

// Hook management commands
const hookCmd = program.command('hook').description('Manage and inspect hooks')
hookCmd
  .command('lint')
  .description(
    'Lint hooks in project .claude/hooks, ~/.anvil/hooks, or --target',
  )
  .option(
    '--target <path>',
    'explicit directory to lint instead of auto-resolved roots',
  )
  .option('--json', 'emit JSON output')
  .option('--strict', 'treat warnings as failures (for CI use)')
  .action(async (opts) =>
    (await import('./commands/cli/hook-lint.js')).hookLintCommand(opts),
  )

// ANV-0199 — Projects preferences introspection
const projectsCmd = program
  .command('projects')
  .description(
    'Inspect per-project artifact preferences (~/.anvil/preferences.json)',
  )
projectsCmd
  .command('list')
  .description('List all tracked projects with their saved preferences')
  .option('--json', 'emit JSON')
  .action(async (opts) =>
    (await import('./commands/cli/projects.js')).projectsListCommand(opts),
  )
projectsCmd
  .command('show [cwd]')
  .description(
    'Show full preferences for a project directory (defaults to current cwd)',
  )
  .option('--json', 'emit JSON')
  .action(async (cwd, opts) =>
    (await import('./commands/cli/projects.js')).projectsShowCommand(cwd, opts),
  )

// ANV-0246 — Catalog commands moved to experimental build.
// Default build registers a stub that emits a gate message.
// Experimental build registers the real subcommands via register-cli.ts.
program
  .command('catalog [subcommand...]')
  .description(
    'Discover, fetch, and promote extensions from remote catalogs [experimental]',
  )
  .allowUnknownOption()
  .action(() => {
    process.stderr.write(
      'Catalog is experimental — run `npm i -g anvil@experimental` or `anvil --experimental catalog …`\n',
    )
    process.exit(64) // 64 = feature unavailable / gated (docs/anvil/exit-codes.md)
  })

// Workflow commands
program
  .command('plan [goal...]')
  .description('Invoke the plan-writing skill for an active feature')
  .option('--feature <slug>', 'target a specific feature slug')
  .option(
    '--force',
    'bypass the research_gate check (open-questions block) for this invocation',
  )
  .option(
    '--strict',
    'flip all WorkflowConfig gates to true in-memory; dispatch plan-verifier as subagent',
  )
  .option(
    '--tier <tier>',
    'model tier for this invocation (quick|coding|review|planning|ultra|super)',
  )
  .option(
    '--auto',
    'ANV-0176: enable decision auto-mode (auto-select recommendation when confidence: high). Honors ANVIL_AUTO=1.',
  )
  .option(
    '--no-auto',
    'ANV-0176: force decision auto-mode off, overriding ANVIL_AUTO.',
  )
  .option(
    '--accept-defaults',
    'ANV-0176: trust me, pick the recommended option always (overrides confidence). Honors ANVIL_AUTO_DEFAULTS=1.',
  )
  .option(
    '--no-accept-defaults',
    'ANV-0176: force accept-defaults off, overriding ANVIL_AUTO_DEFAULTS.',
  )
  .action(async (goalParts, opts) =>
    (await import('./commands/cli/plan.js')).planCommand(
      (goalParts as string[]).join(' '),
      opts as {
        feature?: string
        force?: boolean
        strict?: boolean
        tier?: string
        auto?: boolean
        acceptDefaults?: boolean
      },
    ),
  )
program
  .command('plan-audit <file>')
  .description('Run plan-verifier audit gate on a plan markdown file')
  .action(async (file) =>
    (await import('./commands/cli/plan.js')).planAuditCommand(file),
  )
program
  .command('plan-validate-coverage <file>')
  .description(
    'Map plan tasks to test commands (Nyquist validation layer). Writes <plan-stem>-validation.json and .md next to the plan file.',
  )
  .action(async (file) =>
    (
      await import('./commands/cli/plan-validate-coverage.js')
    ).planValidateCoverageCommand(file),
  )
// ANV-0026 — executable plan contract validator
program
  .command('plan-validate <file>')
  .description(
    "Validate a plan's `executable_plan:` frontmatter against the ExecutablePlan schema (ANV-0026). Does NOT execute verification commands.",
  )
  .option('--json', 'emit machine-readable JSON result')
  .action(async (file: string, opts: { json?: boolean }) =>
    (await import('./commands/cli/plan-validate.js')).planValidateCommand(
      file,
      opts,
    ),
  )
// ANV-0025 Wave 4 — `anvil plan-run <plan-path>` autonomous/state-tracker runner
program
  .command('plan-run <plan-path>')
  .description(
    'Walk a plan markdown file, bootstrap a run directory, and record state transitions (ANV-0025 Wave 4). Default mode is state-tracker: "would dispatch" each task without invoking it. Pass --auto to delegate to the step registry.',
  )
  .option('--json', 'emit machine-readable JSON result')
  .option(
    '--auto',
    'enable autonomous step dispatch via STEP_REGISTRY (default: state-tracker); also engages ANV-0176 decision auto-mode. Honors ANVIL_AUTO=1.',
  )
  .option(
    '--no-auto',
    'ANV-0176: force decision auto-mode off, overriding ANVIL_AUTO.',
  )
  .option(
    '--accept-defaults',
    'ANV-0176: trust me, pick the recommended option always (overrides confidence). Honors ANVIL_AUTO_DEFAULTS=1.',
  )
  .option(
    '--no-accept-defaults',
    'ANV-0176: force accept-defaults off, overriding ANVIL_AUTO_DEFAULTS.',
  )
  .option(
    '--run-dir <dir>',
    'override the run directory (default: /tmp/anvil-runs/<runId>)',
  )
  .option('--run-id <id>', 'override the run ID (default: derived from plan)')
  .action(
    async (
      planPath: string,
      opts: {
        json?: boolean
        auto?: boolean
        acceptDefaults?: boolean
        runDir?: string
        runId?: string
      },
    ) =>
      (await import('./commands/cli/plan-run.js')).planRunCommand(
        planPath,
        opts,
      ),
  )
// ANV-0025 Wave 3 — read-only plan-run status
program
  .command('plan-status <run-dir>')
  .description(
    'Print a one-line summary of a plan run by replaying the journal at `<run-dir>/events.jsonl` against the plan snapshot at `<run-dir>/plan.yml` (ANV-0025 Wave 3). Read-only.',
  )
  .option('--json', 'emit machine-readable JSON result')
  .action(async (runDir: string, opts: { json?: boolean }) =>
    (await import('./commands/cli/plan-status.js')).planStatusCommand(
      runDir,
      opts,
    ),
  )
program
  .command('plan-check-decisions <file>')
  .description(
    'Check that every <decisions> block entry is referenced by at least one task in the plan body. Use --strict to exit 1 on uncovered decisions.',
  )
  .option('--strict', 'Exit with code 1 if any decision id is uncovered')
  .action(async (file, opts) =>
    (
      await import('./commands/cli/plan-check-decisions.js')
    ).planCheckDecisionsCommand(file, opts),
  )
program
  .command('review [target]')
  .description('Invoke the code-reviewer skill')
  .option(
    '-t, --type <type>',
    'spec-compliance|code-quality|both (default: both)',
  )
  .option(
    '--tier <tier>',
    'model tier for this invocation (quick|coding|review|planning|ultra|super)',
  )
  .action(async (target, opts) =>
    (await import('./commands/cli/review.js')).reviewCommand(target, opts),
  )
program
  .command('debug <issue...>')
  .description('Invoke the debugging skill')
  .option(
    '--tier <tier>',
    'model tier for this invocation (quick|coding|review|planning|ultra|super)',
  )
  .action(async (issueParts, opts) =>
    (await import('./commands/cli/debug.js')).debugCommand(
      issueParts.join(' '),
      opts as { tier?: string },
    ),
  )
program
  .command('tdd <feature...>')
  .description('Invoke the test-driven-development skill chain')
  .action(async (featureParts) =>
    (await import('./commands/cli/tdd.js')).tddCommand(featureParts.join(' ')),
  )
program
  .command('ultra <task...>')
  .description('Invoke the ultra-worker agent')
  .option(
    '--strict',
    'flip all WorkflowConfig gates to true in-memory for this invocation (orthogonal to --require-spec)',
  )
  .option(
    '--tier <tier>',
    'model tier for this invocation (quick|coding|review|planning|ultra|super)',
  )
  .option(
    '--auto',
    'headless mode: prepend HEADLESS-MODE banner and enforce pass-cap=5 + per-pass tool budget=20 (Plan 40 Phase G)',
  )
  .action(async (taskParts, opts) =>
    (await import('./commands/cli/ultra.js')).ultraCommand(
      taskParts.join(' '),
      opts as { strict?: boolean; tier?: string; auto?: boolean },
    ),
  )
program
  .command('explore [path]')
  .description('Invoke the project-exploration skill')
  .action(async (path) =>
    (await import('./commands/cli/explore.js')).exploreCommand(path),
  )
program
  .command('pr')
  .description('Invoke github-workflow or gitlab-workflow (auto-detect)')
  .action(async () => (await import('./commands/cli/pr.js')).prCommand())
program
  .command('agents <task...>')
  .description('Invoke the orchestrator for parallel sub-agents')
  .option('--json', 'emit JSON')
  .action(async (taskParts, opts) =>
    (await import('./commands/cli/agents.js')).agentsCommand(
      taskParts.join(' '),
      opts,
    ),
  )
program
  .command('orchestrate <goal...>')
  .description(
    'Invoke the orchestrator with optional parallel background fan-out',
  )
  .option(
    '-p, --parallel <n>',
    'number of parallel background agents (1..5)',
    '1',
  )
  .option('--json', 'emit JSON')
  .action(async (goalParts, opts) =>
    (await import('./commands/cli/orchestrate.js')).orchestrateCommand(
      goalParts.join(' '),
      opts,
    ),
  )
program
  .command('verify')
  .description('Run post-implementation verification')
  .option('--phase <phase>', 'target a specific phase')
  .action(async (opts) =>
    (await import('./commands/cli/verify.js')).verifyCommand(opts),
  )
program
  .command('start-research <topic...>')
  .description('Start research on a topic before implementation')
  .option('--depth <depth>', 'quick | coding | planning', 'coding')
  .action(async (topicParts, opts) =>
    (await import('./commands/cli/start-research.js')).startResearchCommand(
      topicParts.join(' '),
      opts,
    ),
  )
program
  .command('quick <task...>')
  .description('Execute an ad-hoc task without full planning')
  .option('--validate', 'run verification after')
  .option('--discuss', 'discuss first')
  .option('--research', 'research first')
  .option('--save', 'save to .anvil/quick-log.json')
  .action(async (taskParts, opts) =>
    (await import('./commands/cli/quick.js')).quickCommand(
      taskParts.join(' '),
      opts,
    ),
  )
program
  .command('progress')
  .description('Show current branch, recent commits, cost, and next action')
  .option('--json', 'emit JSON')
  .action(async (opts) =>
    (await import('./commands/cli/progress.js')).progressCommand(opts),
  )
program
  .command('pause')
  .description('Save current work state for session continuity')
  .action(async () => (await import('./commands/cli/pause.js')).pauseCommand())
program
  .command('resume')
  .description('Restore saved work state')
  .action(async () =>
    (await import('./commands/cli/resume.js')).resumeCommand(),
  )
program
  .command('discuss <topic...>')
  .description('Structured decision capture')
  .option(
    '--auto',
    'ANV-0176: enable decision auto-mode (auto-select recommendation when confidence: high). Honors ANVIL_AUTO=1.',
  )
  .option(
    '--no-auto',
    'ANV-0176: force decision auto-mode off, overriding ANVIL_AUTO.',
  )
  .option(
    '--accept-defaults',
    'ANV-0176: trust me, pick the recommended option always (overrides confidence). Honors ANVIL_AUTO_DEFAULTS=1.',
  )
  .option(
    '--no-accept-defaults',
    'ANV-0176: force accept-defaults off, overriding ANVIL_AUTO_DEFAULTS.',
  )
  .action(
    async (
      topicParts: string[],
      opts: { auto?: boolean; acceptDefaults?: boolean },
    ) =>
      (await import('./commands/cli/discuss.js')).discussCommand(
        topicParts.join(' '),
        opts,
      ),
  )
program
  .command('finish')
  .description(
    'Complete a development branch: verify tests, then merge, PR, keep, or discard',
  )
  .option('--mode <mode>', 'merge | pr | keep | discard')
  .option('--yes', 'skip prompts, default to pr')
  .option('--dry-run', 'print what would happen without executing')
  .action(async (opts) =>
    (await import('./commands/cli/finish.js')).finishCommand(opts),
  )

program
  .command('route <prompt...>')
  .description('Show routing diagnostics for a prompt — intents, skills, agent')
  .option('--json', 'emit JSON output')
  .option('--no-color', 'disable ANSI colour output')
  .option(
    '--project-dir <path>',
    'project root for context detection (default: cwd)',
  )
  .action(
    async (
      promptParts: string[],
      opts: { json?: boolean; color?: boolean; projectDir?: string },
    ) => {
      const { routeCommand } = await import('./commands/cli/route.js')
      await routeCommand(promptParts.join(' '), opts)
    },
  )
program
  .command('recommend [path]')
  .description(
    'Recommend Anvil skills, agents, hooks, and MCPs based on detected project signals',
  )
  .option('--json', 'emit JSON output')
  .option('--top <n>', 'limit to the top N recommendations', (v) =>
    Number.parseInt(v, 10),
  )
  .option(
    '--surface <surface>',
    'filter by surface: skills | hooks | agents | mcps | all',
    'all',
  )
  .option('--no-color', 'disable ANSI colour output')
  .action(
    async (
      path: string | undefined,
      opts: {
        json?: boolean
        top?: number
        surface?: 'skills' | 'hooks' | 'agents' | 'mcps' | 'all'
        color?: boolean
      },
    ) => {
      const { recommendCommand } = await import('./commands/cli/recommend.js')
      await recommendCommand({
        path,
        json: opts.json,
        top: opts.top,
        surface: opts.surface,
        color: opts.color,
      })
    },
  )
// ANV-0247 — Note command moved to experimental build.
// Default build registers a stub that emits a gate message.
// Experimental build registers the real commands via register-cli.ts.
program
  .command('note [args...]')
  .description(
    'Zero-friction idea capture: "anvil note <text>" | "anvil note list" | "anvil note promote <file>" [experimental]',
  )
  .allowUnknownOption()
  .action(() => {
    process.stderr.write(
      'Note is experimental — run `npm i -g anvil@experimental` or `anvil --experimental note …`\n',
    )
    process.exit(64) // 64 = feature unavailable / gated (docs/anvil/exit-codes.md)
  })
program
  .command('revise-claude-md')
  .description('Audit and improve CLAUDE.md files')
  .option('--focus <area>', 'focus on a specific area (e.g., hooks, skills)')
  .option('--scope <scope>', 'project | global', 'project')
  .action(async (opts) => {
    const { reviseClamdeMdCommand } = await import(
      './commands/cli/revise-claude-md.js'
    )
    await reviseClamdeMdCommand(opts)
  })

// ANV-0247 — Notepad command moved to experimental build.
// Default build registers a stub that emits a gate message.
// Experimental build registers the real commands via register-cli.ts.
program
  .command('notepad [args...]')
  .description(
    'Per-branch token-bounded breadcrumb system: init | read | write | list | clean | validate | compact | archive | restore [experimental]',
  )
  .allowUnknownOption()
  .action(() => {
    process.stderr.write(
      'Notepad is experimental — run `npm i -g anvil@experimental` or `anvil --experimental notepad …`\n',
    )
    process.exit(64) // 64 = feature unavailable / gated (docs/anvil/exit-codes.md)
  })

// ANV-0248 — Experimental CLI gating.
// Dynamic import so the default build never pulls in src/experimental/*.
// Path is constructed at runtime so TypeScript does NOT follow the import as
// a static dependency (prevents tsc from emitting dist/experimental/).
// The try/catch fallback is intentional: if the experimental module is absent
// (default build), this is a no-op and the program runs without those commands.
void (async () => {
  try {
    // Deliberately opaque to TypeScript's module resolver — use string concat
    // so tsc does not treat this as a static import and compile the module.
    const expPath = './experimental/' + 'register-cli.js'
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const expMod = (await import(
      /* @vite-ignore */
      expPath
    )) as { registerExperimentalCommands?: (p: Command) => void }
    expMod.registerExperimentalCommands?.(program)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
      process.stderr.write(
        `[anvil:index] warn: experimental load failed: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
    // Expected default-build path: module absent → silent.
  }
  await program.parseAsync(process.argv)
})().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
