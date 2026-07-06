import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import {
  appendEntry,
  compact,
  detectBranch,
  initNotepad,
  listNotepads,
  loadRecentContext,
  readSection,
} from '../../../core/notepads/index.js'
import {
  deriveBranchSlug,
  getArchivePath,
  getNotepadsDir,
  getSectionPath,
} from '../../../core/notepads/paths.js'
import {
  type NotepadsEntry,
  NotepadsSection,
} from '../../../core/notepads/types.js'

// ─── Options ─────────────────────────────────────────────────────────────────

export interface NotepadsOptions {
  cwd?: string
  args?: string[]
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * `anvil notepad <subcommand> [options]`
 *
 * Subcommands:
 *   init [--branch <name>]
 *   read [--section <name>] [--branch <name>]
 *   write --section <name> --headline <text> [--body <text>] [--source <skill>]
 *   list
 *   clean [--dry-run]
 *   validate
 *   compact [--branch <name>]
 *   archive [--branch <name>]
 *   restore [--branch <name>]
 */
export async function notepadsCommand(
  opts: NotepadsOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const args = opts.args ?? []

  if (args.length === 0) {
    printUsage()
    return
  }

  const [subcommand, ...rest] = args

  switch (subcommand) {
    case 'init':
      return cmdInit(cwd, rest)
    case 'read':
      return cmdRead(cwd, rest)
    case 'write':
      return cmdWrite(cwd, rest)
    case 'list':
      return cmdList(cwd)
    case 'clean':
      return cmdClean(cwd, rest)
    case 'validate':
      return cmdValidate(cwd)
    case 'compact':
      return cmdCompact(cwd, rest)
    case 'archive':
      return cmdArchive(cwd, rest)
    case 'restore':
      return cmdRestore(cwd, rest)
    default:
      process.stderr.write(chalk.red(`Unknown subcommand: ${subcommand}\n`))
      printUsage()
      process.exitCode = 1
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`Usage: anvil notepad <subcommand> [options]

Subcommands:
  init [--branch <name>]                Create notepad for current/named branch
  read [--section <name>] [--branch <name>]
                                        Print section or recent-context
  write --section <name> --headline <text> [--body <text>] [--source <skill>]
                                        Append an entry to a section
  list                                  List branch slugs with notepads
  clean [--dry-run]                     Remove notepads for deleted branches
  validate                              Schema-validate all entries
  compact [--branch <name>]             Apply compression (7-day eviction)
  archive [--branch <name>]             Move notepad to .anvil/archive/
  restore [--branch <name>]             Restore notepad from archive`)
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    }
  }
  return flags
}

function currentBranch(cwd: string): string {
  return detectBranch(cwd)
}

// ─── Subcommand implementations ───────────────────────────────────────────────

async function cmdInit(cwd: string, args: string[]): Promise<void> {
  const flags = parseFlags(args)
  const branch = (flags.branch as string) ?? currentBranch(cwd)
  const slug = deriveBranchSlug(branch)

  const created = await initNotepad(cwd, branch)

  if (created.length === 0) {
    console.log(chalk.dim(`Notepad already exists for branch: ${slug}`))
  } else {
    console.log(chalk.green(`Initialized notepad for branch: ${slug}`))
    for (const f of created) {
      console.log(chalk.dim(`  created ${f}`))
    }
  }
}

async function cmdRead(cwd: string, args: string[]): Promise<void> {
  const flags = parseFlags(args)
  const branch = (flags.branch as string) ?? currentBranch(cwd)
  const section = flags.section as string | undefined

  if (section) {
    const parsed = NotepadsSection.safeParse(section)
    if (!parsed.success) {
      process.stderr.write(
        chalk.red(
          `Invalid section: ${section}. Valid: learnings, decisions, issues, verification, problems\n`,
        ),
      )
      process.exitCode = 1
      return
    }
    const entries = await readSection(cwd, branch, parsed.data)
    if (entries.length === 0) {
      console.log(
        chalk.dim(
          `No entries in ${section} for branch: ${deriveBranchSlug(branch)}`,
        ),
      )
      return
    }
    for (const e of entries) {
      console.log(
        chalk.bold(`${e.timestamp.slice(0, 10)} [${e.source}] ${e.headline}`),
      )
      if (e.body) console.log(chalk.dim(e.body))
    }
  } else {
    // Read recent-context
    const content = await loadRecentContext(cwd, branch)
    if (!content) {
      console.log(
        chalk.dim(
          `No notepad for branch: ${deriveBranchSlug(branch)}. Run 'anvil notepad init'`,
        ),
      )
      return
    }
    console.log(content)
  }
}

async function cmdWrite(cwd: string, args: string[]): Promise<void> {
  const flags = parseFlags(args)

  const sectionRaw = flags.section as string | undefined
  if (!sectionRaw) {
    process.stderr.write(chalk.red('--section is required\n'))
    process.exitCode = 1
    return
  }
  const parsed = NotepadsSection.safeParse(sectionRaw)
  if (!parsed.success) {
    process.stderr.write(
      chalk.red(
        `Invalid section: ${sectionRaw}. Valid: learnings, decisions, issues, verification, problems\n`,
      ),
    )
    process.exitCode = 1
    return
  }

  const headline = flags.headline as string | undefined
  if (!headline) {
    process.stderr.write(chalk.red('--headline is required\n'))
    process.exitCode = 1
    return
  }

  const body = flags.body as string | undefined
  const source = (flags.source as string | undefined) ?? 'cli'
  const branch = (flags.branch as string | undefined) ?? currentBranch(cwd)

  const entry: NotepadsEntry = {
    section: parsed.data,
    headline: headline.slice(0, 80),
    body,
    source,
    timestamp: new Date().toISOString(),
  }

  await appendEntry(cwd, branch, entry)
  console.log(
    chalk.green(
      `Wrote to ${parsed.data} (${deriveBranchSlug(branch)}): ${headline.slice(0, 60)}`,
    ),
  )
}

async function cmdList(cwd: string): Promise<void> {
  const slugs = await listNotepads(cwd)
  if (slugs.length === 0) {
    console.log(
      chalk.dim('No notepads found. Run `anvil notepad init` to create one.'),
    )
    return
  }
  console.log(chalk.bold('Branches with notepads:'))
  for (const slug of slugs) {
    console.log(`  ${slug}`)
  }
}

async function cmdClean(cwd: string, args: string[]): Promise<void> {
  const flags = parseFlags(args)
  const dryRun = flags['dry-run'] === true

  // Get list of branches that exist locally
  let localBranches: Set<string>
  try {
    const output = execSync('git branch', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    localBranches = new Set(
      output
        .split('\n')
        .map((b) => b.replace(/^\*?\s+/, '').trim())
        .filter(Boolean),
    )
  } catch {
    process.stderr.write(
      chalk.yellow('Could not list git branches. Skipping clean.\n'),
    )
    return
  }

  const notepadsDir = getNotepadsDir(cwd)
  if (!existsSync(notepadsDir)) {
    console.log(chalk.dim('No notepads directory found.'))
    return
  }

  const slugs = await listNotepads(cwd)
  const localSlugs = new Set(
    Array.from(localBranches).map((b) => deriveBranchSlug(b)),
  )

  let removed = 0
  for (const slug of slugs) {
    if (!localSlugs.has(slug)) {
      const notepadsPath = join(notepadsDir, slug)
      if (dryRun) {
        console.log(chalk.dim(`[dry-run] would archive: ${slug}`))
      } else {
        // Archive it
        const archivePath = getArchivePath(cwd, slug)
        const archiveParent = join(cwd, '.anvil', 'archive')
        if (!existsSync(archiveParent))
          mkdirSync(archiveParent, { recursive: true })
        renameSync(notepadsPath, archivePath)
        console.log(chalk.green(`Archived notepad for deleted branch: ${slug}`))
      }
      removed++
    }
  }

  if (removed === 0) {
    console.log(
      chalk.dim('All notepads match existing branches — nothing to clean.'),
    )
  } else if (dryRun) {
    console.log(chalk.dim(`[dry-run] ${removed} notepad(s) would be archived.`))
  } else {
    console.log(chalk.green(`Cleaned ${removed} notepad(s).`))
  }
}

async function cmdValidate(cwd: string): Promise<void> {
  const slugs = await listNotepads(cwd)
  if (slugs.length === 0) {
    console.log(chalk.dim('No notepads to validate.'))
    return
  }

  let badCount = 0
  for (const slug of slugs) {
    for (const section of NotepadsSection.options) {
      const sectionPath = getSectionPath(cwd, slug, section)
      if (!existsSync(sectionPath)) continue

      try {
        await readFile(sectionPath, 'utf-8')
        // If we can read it, basic validation passes
      } catch {
        process.stderr.write(
          chalk.red(`  [bad] ${slug}/${section}.md — unreadable\n`),
        )
        badCount++
      }
    }
  }

  if (badCount === 0) {
    console.log(chalk.green(`Validated ${slugs.length} notepad(s) — all OK`))
  } else {
    console.log(
      chalk.yellow(
        `Found ${badCount} bad section file(s). Run \`anvil notepad compact\` to repair.`,
      ),
    )
    process.exitCode = 1
  }
}

async function cmdCompact(cwd: string, args: string[]): Promise<void> {
  const flags = parseFlags(args)
  const branchArg = flags.branch as string | undefined
  const branch = branchArg ?? currentBranch(cwd)
  const slug = deriveBranchSlug(branch)

  const result = await compact(cwd, branch)
  console.log(
    chalk.green(
      `Compacted notepad for ${slug}: ${result.removed} entries compressed, ${result.kept} entries kept`,
    ),
  )
}

async function cmdArchive(cwd: string, args: string[]): Promise<void> {
  const flags = parseFlags(args)
  const branchArg = flags.branch as string | undefined
  const branch = branchArg ?? currentBranch(cwd)
  const slug = deriveBranchSlug(branch)

  const notepadsDir = getNotepadsDir(cwd)
  const sourcePath = join(notepadsDir, slug)
  if (!existsSync(sourcePath)) {
    process.stderr.write(chalk.red(`No notepad found for branch: ${slug}\n`))
    process.exitCode = 1
    return
  }

  const archivePath = getArchivePath(cwd, slug)
  if (existsSync(archivePath)) {
    process.stderr.write(
      chalk.red(`Archive already exists for ${slug}. Remove it first.\n`),
    )
    process.exitCode = 1
    return
  }

  const archiveParent = join(cwd, '.anvil', 'archive')
  if (!existsSync(archiveParent)) mkdirSync(archiveParent, { recursive: true })

  renameSync(sourcePath, archivePath)
  console.log(chalk.green(`Archived notepad: ${slug} → .anvil/archive/${slug}`))
}

async function cmdRestore(cwd: string, args: string[]): Promise<void> {
  const flags = parseFlags(args)
  const branchArg = flags.branch as string | undefined
  const branch = branchArg ?? currentBranch(cwd)
  const slug = deriveBranchSlug(branch)

  const archivePath = getArchivePath(cwd, slug)
  if (!existsSync(archivePath)) {
    process.stderr.write(chalk.red(`No archive found for branch: ${slug}\n`))
    process.exitCode = 1
    return
  }

  const notepadsDir = getNotepadsDir(cwd)
  const targetPath = join(notepadsDir, slug)
  if (!existsSync(notepadsDir)) mkdirSync(notepadsDir, { recursive: true })

  if (existsSync(targetPath)) {
    process.stderr.write(
      chalk.yellow(
        `Active notepad already exists for ${slug}. Archive it first.\n`,
      ),
    )
    process.exitCode = 1
    return
  }

  renameSync(archivePath, targetPath)
  console.log(chalk.green(`Restored notepad: .anvil/archive/${slug} → ${slug}`))
}
