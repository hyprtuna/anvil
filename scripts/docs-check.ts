#!/usr/bin/env bun
/**
 * ANV-0007 — docs:check standalone runner.
 *
 * Runs the doc-drift lint engine against README.md + docs/*.md and
 * templates/AGENTS.md, prints a report, and exits non-zero when
 * violations are found.
 *
 * Usage:
 *   bun run scripts/docs-check.ts
 *   npm run docs:check
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type DocDriftViolation,
  formatDocDriftSummary,
  runDocDriftLint,
} from '../src/core/docs/lint/index.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

const result = runDocDriftLint(ROOT)

// Group violations by file for readable output
const byFile = new Map<string, DocDriftViolation[]>()
for (const v of result.violations) {
  if (!byFile.has(v.file)) byFile.set(v.file, [])
  byFile.get(v.file)!.push(v)
}

if (byFile.size > 0) {
  process.stdout.write('\ndoc-drift violations:\n\n')
  for (const [file, viols] of byFile) {
    process.stdout.write(`  ${file}\n`)
    for (const v of viols) {
      process.stdout.write(`    line ${v.line} [${v.rule}] ${v.detail}\n`)
    }
    process.stdout.write('\n')
  }
}

const summary = formatDocDriftSummary(result)
process.stdout.write(`\ndoc-drift: ${summary}\n`)

if (result.violations.length > 0) {
  process.stdout.write(
    '\nFix violations or suppress with <!-- doc-drift: skip --> on the offending line.\n',
  )
  process.exit(1)
}
