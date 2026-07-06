import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import chalk from 'chalk'
import { maybeEmitJson } from '../../src/commands/cli/common/json-mode.js'
import { buildPrSuggestion } from '../../src/core/release/build-pr-suggestion.js'
import { bumpVersionFiles } from '../../src/core/release/bump-version-files.js'
import { flipSlateStatus } from '../../src/core/release/flip-slate-status.js'
import { parseSlateSections } from '../../src/core/release/parse-slate-sections.js'
import { prependChangelog } from '../../src/core/release/prepend-changelog.js'
import { rewriteVersionBumpTests } from '../../src/core/release/rewrite-version-bump-tests.js'
import { compareSemver } from '../../src/core/release/semver.js'
import type { ReleasePlan } from '../../src/core/release/types.js'
import { SemverVersion } from '../../src/core/release/types.js'

export interface ReleaseOptions {
  dryRun?: boolean
  json?: boolean
  from?: string
  allowDirty?: boolean
  /**
   * Overwrite the released slate from the plan file even when the slate
   * already exists. Default behaviour (false) skips the copy with an
   * info-line so contributor edits to the released slate are preserved.
   * (ANV-0177)
   */
  forceCopy?: boolean
}

/**
 * `anvil release <version>` — idempotent release ceremony.
 *
 * What it does (dry-run produces a plan; actual run writes files):
 *   1. Bump version in package.json + marketplace.json.
 *   2. Rewrite version-bump test files (new first, old second — PR #69 guard).
 *   3. Mark release slate as released.
 *   4. Prepend CHANGELOG entry from slate sections.
 *   5. Print a one-line summary + git + PR suggestions.
 *
 * What it does NOT do:
 *   - Execute git commit / git tag / git push (operator runs those after review).
 *
 * @param version - target release version (positional arg)
 * @param opts    - command options
 * @param cwd     - working directory (default: process.cwd())
 */
export async function releaseCommand(
  version: string,
  opts: ReleaseOptions = {},
  cwd = process.cwd(),
): Promise<void> {
  const dryRun = opts.dryRun ?? false
  const json = opts.json ?? false
  const allowDirty = opts.allowDirty ?? false
  const forceCopy = opts.forceCopy ?? false

  // ── Validation ─────────────────────────────────────────────────────────────

  // 1. Validate <version> parses as semver.
  const toResult = SemverVersion.safeParse(version)
  if (!toResult.success) {
    process.stderr.write(
      `anvil release: invalid version "${version}". Must be MAJOR.MINOR.PATCH.\n`,
    )
    process.exit(1)
  }
  const to = toResult.data

  // 2. Resolve <from> — either --from flag or package.json.
  let from: string
  if (opts.from !== undefined) {
    const fromResult = SemverVersion.safeParse(opts.from)
    if (!fromResult.success) {
      process.stderr.write(
        `anvil release: invalid --from "${opts.from}". Must be MAJOR.MINOR.PATCH.\n`,
      )
      process.exit(1)
    }
    from = fromResult.data
  } else {
    try {
      const pkg = JSON.parse(
        readFileSync(join(cwd, 'package.json'), 'utf-8'),
      ) as { version: string }
      from = pkg.version
    } catch {
      process.stderr.write(
        'anvil release: could not read package.json to determine current version. Use --from <version>.\n',
      )
      process.exit(1)
    }
  }

  // Validate from is a valid semver.
  const fromResult = SemverVersion.safeParse(from)
  if (!fromResult.success) {
    process.stderr.write(
      `anvil release: current version "${from}" is not a valid semver. Use --from <version>.\n`,
    )
    process.exit(1)
  }
  const fromVersion = fromResult.data

  // 3. Ensure to > from.
  if (compareSemver(to, fromVersion) !== 1) {
    process.stderr.write(
      `anvil release: target version ${to} must be strictly greater than current version ${fromVersion}.\n`,
    )
    process.exit(1)
  }

  // 4. Verify versions in package.json and marketplace.json are in sync.
  try {
    const mkt = JSON.parse(
      readFileSync(join(cwd, 'marketplace.json'), 'utf-8'),
    ) as { version: string }
    if (mkt.version !== fromVersion) {
      process.stderr.write(
        `anvil release: version mismatch — package.json is ${fromVersion} but marketplace.json is ${mkt.version}. Fix the mismatch before running release.\n`,
      )
      process.exit(1)
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    // marketplace.json doesn't exist — skip the sync check.
  }

  // 5. Verify in-flight plan exists at .anvil/plans/v<to>.plan.md.
  //    The plan is the canonical source for the released slate (ANV-0177 /
  //    ANV-0174 lifecycle). If absent, the contributor must draft it first.
  const planRel = join('.anvil', 'plans', `v${to}.plan.md`)
  const planPath = join(cwd, planRel)
  if (!existsSync(planPath)) {
    process.stderr.write(
      `anvil release: plan file not found at ${planRel}. Draft the plan before releasing.\n`,
    )
    process.exit(1)
  }

  // 6. Determine whether the released slate already exists.
  //    If absent → copy from plan. If present and --force-copy → re-copy.
  //    Otherwise → skip the copy (preserve any contributor edits) with an
  //    info-line.
  const slatePath = join(cwd, 'docs', 'anvil', 'releases', `v${to}.md`)
  const slateRel = join('docs', 'anvil', 'releases', `v${to}.md`)
  const slateExists = existsSync(slatePath)
  const willCopy = !slateExists || forceCopy
  const skipCopyInfo = !willCopy
    ? `slate already exists at ${slateRel}; skipping copy from plan (use --force-copy to override)`
    : null

  // 7. Check the source content (plan or existing slate) is not already
  //    marked released — protect against double-release.
  const sourceRaw = readFileSync(willCopy ? planPath : slatePath, 'utf-8')
  if (/^Status:\s*(released|shipped)/im.test(sourceRaw)) {
    const label = willCopy ? `plan v${to}.plan.md` : `slate v${to}.md`
    process.stderr.write(
      `anvil release: ${label} is already marked as released. Was this release already completed?\n`,
    )
    process.exit(1)
  }

  // 8. Check previous version-bump test file exists.
  const prevTestPath = join(
    cwd,
    'tests',
    'unit',
    'release',
    `version-bump-v${fromVersion}.test.ts`,
  )
  if (!existsSync(prevTestPath)) {
    process.stderr.write(
      `anvil release: expected version-bump test file not found at ${prevTestPath}.\n`,
    )
    process.exit(1)
  }

  // 9. Guard dirty working tree (unless --allow-dirty).
  if (!allowDirty) {
    try {
      const dirty = execSync('git status --porcelain', {
        cwd,
        encoding: 'utf-8',
      }).trim()
      if (dirty.length > 0) {
        process.stderr.write(
          'anvil release: working tree is dirty. Commit or stash changes before releasing.\nUse --allow-dirty to skip this check.\n',
        )
        process.exit(1)
      }
    } catch {
      // Not in a git repo — skip the check silently.
    }
  }

  // ── Build the plan ──────────────────────────────────────────────────────────

  const isoDate = new Date().toISOString().slice(0, 10)
  // PR-suggestion + changelog content derive from the plan when we are about
  // to copy (canonical source) and from the existing slate otherwise.
  const sections = parseSlateSections(sourceRaw)
  const prSuggestion = buildPrSuggestion(fromVersion, to, sections)

  const copyStepTarget = willCopy
    ? forceCopy && slateExists
      ? `${planRel} → ${slateRel} (overwrite, --force-copy)`
      : `${planRel} → ${slateRel}`
    : (skipCopyInfo ?? '')

  const plan: ReleasePlan = {
    from: fromVersion,
    to,
    dryRun,
    isoDate,
    steps: [
      {
        step: 1,
        action: willCopy
          ? 'copy plan to released slate'
          : 'copy plan to released slate (skipped)',
        target: copyStepTarget,
        status: willCopy ? 'pending' : 'skipped',
      },
      {
        step: 2,
        action: 'bump version files',
        target: 'package.json, marketplace.json',
        status: 'pending',
      },
      {
        step: 3,
        action: 'rewrite version-bump tests',
        target: `version-bump-v${to}.test.ts (new, first), version-bump-v${fromVersion}.test.ts (historical, second)`,
        status: 'pending',
      },
      {
        step: 4,
        action: 'flip slate status',
        target: `docs/anvil/releases/v${to}.md → Status: released ${isoDate}`,
        status: 'pending',
      },
      {
        step: 5,
        action: 'prepend changelog entry',
        target: `CHANGELOG.md — ## [${to}] — ${isoDate}`,
        status: 'pending',
      },
    ],
    gitSuggestion: {
      commitMessage: `chore(release): v${to}`,
      tagName: `v${to}`,
      pushCommand: `git push origin HEAD && git tag v${to} && git push origin v${to}`,
    },
    prSuggestion,
  }

  // ── Dry-run path ────────────────────────────────────────────────────────────

  if (dryRun) {
    if (maybeEmitJson(plan, { json })) return

    process.stdout.write(
      `${chalk.bold(`anvil release ${to}`)} — dry-run (${fromVersion} → ${to})\n\n`,
    )
    if (skipCopyInfo !== null) {
      process.stdout.write(`${chalk.yellow('info:')} ${skipCopyInfo}\n\n`)
    }
    for (const step of plan.steps) {
      process.stdout.write(
        `  ${chalk.gray(`${step.step}.`)} ${chalk.cyan(step.action)}\n` +
          `     ${chalk.gray(step.target)}\n`,
      )
    }
    process.stdout.write('\n')
    process.stdout.write(`${chalk.bold('Git suggestion:')}\n`)
    process.stdout.write(
      `  git add -p && git commit -m "${plan.gitSuggestion.commitMessage}"\n`,
    )
    process.stdout.write(`  git tag ${plan.gitSuggestion.tagName}\n`)
    process.stdout.write(
      `  git push origin HEAD && git push origin ${plan.gitSuggestion.tagName}\n`,
    )
    process.stdout.write('\n')
    process.stdout.write(`${chalk.bold('PR suggestion:')}\n`)
    process.stdout.write(`  Title: ${prSuggestion.title}\n`)
    return
  }

  // ── Execute path ────────────────────────────────────────────────────────────

  const succeededSteps: number[] = []
  let exitCode = 0

  if (skipCopyInfo !== null) {
    process.stdout.write(`${chalk.yellow('info:')} ${skipCopyInfo}\n`)
  }

  try {
    // Step 1: copy plan → released slate (or skip if it already exists and
    // --force-copy was not passed).
    if (willCopy) {
      mkdirSync(dirname(slatePath), { recursive: true })
      copyFileSync(planPath, slatePath)
    }
    succeededSteps.push(1)

    // Step 2: bump version files.
    bumpVersionFiles(cwd, fromVersion, to)
    succeededSteps.push(2)

    // Step 3: rewrite version-bump tests (new first, old second — PR #69 guard).
    rewriteVersionBumpTests(cwd, fromVersion, to)
    succeededSteps.push(3)

    // Step 4: flip slate status.
    flipSlateStatus(cwd, to, isoDate)
    succeededSteps.push(4)

    // Step 5: prepend changelog.
    prependChangelog(cwd, to, isoDate, slatePath)
    succeededSteps.push(5)
  } catch (err) {
    process.stderr.write(
      `anvil release: step failed — ${err instanceof Error ? err.message : String(err)}\n`,
    )
    if (succeededSteps.length > 0) {
      process.stderr.write(
        `  Steps completed before failure: ${succeededSteps.join(', ')}\n`,
      )
    }
    exitCode = 2
  }

  if (exitCode === 0) {
    // Mark all steps as done — except the copy step retains its 'skipped'
    // status when the slate already existed and --force-copy was not passed.
    for (const step of plan.steps) {
      if (step.status === 'skipped') continue
      step.status = 'done'
    }
  }

  if (maybeEmitJson(plan, { json })) {
    process.exit(exitCode)
    return
  }

  if (exitCode === 0) {
    process.stdout.write(
      `${chalk.green('✓')} ${chalk.bold(`anvil release ${to}`)} — ${fromVersion} → ${to} (${isoDate})\n\n`,
    )
    process.stdout.write(`${chalk.bold('Files written:')}\n`)
    if (willCopy) {
      process.stdout.write(
        `  ${slateRel} — copied from ${planRel}${forceCopy && slateExists ? ' (overwrite)' : ''}\n`,
      )
    }
    process.stdout.write(`  package.json, marketplace.json — version → ${to}\n`)
    process.stdout.write(
      `  tests/unit/release/version-bump-v${to}.test.ts — new\n`,
    )
    process.stdout.write(
      `  tests/unit/release/version-bump-v${fromVersion}.test.ts — historical\n`,
    )
    process.stdout.write(
      `  docs/anvil/releases/v${to}.md — Status: released ${isoDate}\n`,
    )
    process.stdout.write(`  CHANGELOG.md — prepended [${to}] entry\n`)
    process.stdout.write('\n')
    process.stdout.write(`${chalk.bold('Review, then run:')}\n`)
    process.stdout.write(
      `  git add -p && git commit -m "${plan.gitSuggestion.commitMessage}"\n`,
    )
    process.stdout.write(`  git tag ${plan.gitSuggestion.tagName}\n`)
    process.stdout.write(
      `  git push origin HEAD && git push origin ${plan.gitSuggestion.tagName}\n`,
    )
    process.stdout.write('\n')
    process.stdout.write(`${chalk.bold('PR title:')} ${prSuggestion.title}\n`)
  }

  process.exit(exitCode)
}

// ---------------------------------------------------------------------------
// CLI entrypoint (when run directly via `bun run scripts/dev/release.ts`)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2)
  const version = args.find((a) => !a.startsWith('-'))
  if (!version) {
    process.stderr.write(
      'Usage: bun run scripts/dev/release.ts <version> [--dry-run] [--json] [--from <version>] [--allow-dirty] [--force-copy]\n',
    )
    process.exit(1)
  }
  const opts: ReleaseOptions = {
    dryRun: args.includes('--dry-run'),
    json: args.includes('--json'),
    allowDirty: args.includes('--allow-dirty'),
    forceCopy: args.includes('--force-copy'),
  }
  const fromIdx = args.indexOf('--from')
  if (fromIdx !== -1 && args[fromIdx + 1]) {
    opts.from = args[fromIdx + 1]
  }
  releaseCommand(version, opts).catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  })
}
