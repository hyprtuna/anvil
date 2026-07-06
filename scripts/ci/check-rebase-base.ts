#!/usr/bin/env bun
/**
 * ANV-0144 — Pre-rebase stale-base guard (CLI runner).
 *
 * Compares the current branch's fork point against the upstream release branch
 * tip and warns (or fails in --strict mode) when the base is stale.
 *
 * Usage:
 *   bunx tsx scripts/ci/check-rebase-base.ts [--json] [--strict] [--release-branch <name>]
 *
 * For programmatic use, import from src/core/rebase-guard/index.ts instead.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type RebaseBaseResult,
  checkRebaseBase,
  deriveReleaseBranch,
  formatJson,
  formatPlainText,
} from '../../src/core/rebase-guard/index.js'

export type { RebaseBaseResult }
export { checkRebaseBase, deriveReleaseBranch, formatJson, formatPlainText }

// ---------------------------------------------------------------------------
// Package version reader (used by CLI only — core module is pure)
// ---------------------------------------------------------------------------

/**
 * Read the package.json version from the repo root.
 * Exported for unit tests.
 */
export function readPackageVersion(root: string): string {
  try {
    const pkgPath = join(root, 'package.json')
    const raw = readFileSync(pkgPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    if (typeof parsed.version === 'string') return parsed.version
  } catch {
    // fallback
  }
  return '0.0.0'
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function realRunGit(...args: string[]): string {
  return execSync(`git ${args.map((a) => JSON.stringify(a)).join(' ')}`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const jsonMode = argv.includes('--json')
  const strict = argv.includes('--strict')

  // --release-branch <name>
  let cliReleaseBranch: string | undefined
  const rbIdx = argv.indexOf('--release-branch')
  if (rbIdx !== -1 && argv[rbIdx + 1]) {
    cliReleaseBranch = argv[rbIdx + 1]
  }

  // Resolve release branch: CLI arg > ANVIL_RELEASE_BRANCH env > package.json derivation
  const root = join(fileURLToPath(import.meta.url), '..', '..', '..')
  const envBranch = process.env['ANVIL_RELEASE_BRANCH']
  const packageVersion = readPackageVersion(root)
  const releaseBranch =
    cliReleaseBranch ?? deriveReleaseBranch(packageVersion, envBranch)

  const result = await checkRebaseBase({
    runGit: realRunGit,
    releaseBranch,
    strict,
  })

  if (jsonMode) {
    process.stdout.write(formatJson(result) + '\n')
  } else {
    process.stdout.write(formatPlainText(result) + '\n')
  }

  if (result.status === 'fail') {
    process.exit(1)
  }
}

// Only run main() when executed directly (not imported).
// Substring matches on argv[1] are unsafe — a test file path containing
// 'check-rebase-base' would trigger main() on import (same fork-bomb hazard
// fixed in gate.ts under ANV-0153). Use exact absolute-path equivalence
// between the running module's URL and the resolved entry point.
const moduleFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (moduleFile === entryFile) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `check-rebase-base error: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  })
}
