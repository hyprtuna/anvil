/**
 * GateGuard fact-evaluation policy (Plan 43 Phase C).
 *
 * Evaluates the 4-fact gate against a target file path and observed session
 * state. Pure (no I/O), unit-testable in isolation.
 */

import { basename, dirname } from 'node:path'
import type { GateGuardState } from './state.js'

const SCHEMA_PATTERNS = [
  /\/types\.ts$/,
  /\.types\.ts$/,
  /\/schema[^/]*\.ts$/,
  /\.schema\.[^/]+$/,
]

export function isSchemaFile(filePath: string): boolean {
  return SCHEMA_PATTERNS.some((p) => p.test(filePath))
}

export interface FactResult {
  satisfied: boolean
  missing: string[]
}

export function evaluateFacts(
  targetPath: string,
  state: GateGuardState,
): FactResult {
  const missing: string[] = []
  const targetBasename = basename(targetPath)
  const targetDir = dirname(targetPath)

  // Fact 1 — Importers gathered
  const baseWithoutExt = targetBasename.replace(/\.[^.]+$/, '')
  const hasGrep = state.greps.some((g) => {
    const pat = g.pattern
    return (
      pat.includes(targetBasename) ||
      pat.includes(targetPath) ||
      targetBasename.includes(pat) ||
      baseWithoutExt.includes(pat) ||
      pat.includes(baseWithoutExt)
    )
  })
  const hasGlob = state.globs.some((g) => {
    const pat = g.pattern
    return (
      pat.includes(targetDir) ||
      pat.includes(targetBasename) ||
      targetDir.includes(pat)
    )
  })
  if (!hasGrep && !hasGlob) {
    missing.push(
      `Fact 1 (importers): Use Grep with pattern "${targetBasename}" or Glob with a pattern matching "${targetDir}" to gather files that import/use this file.`,
    )
  }

  // Fact 2 — Public API surface read
  const hasRead = state.reads.some(
    (r) =>
      r.path === targetPath ||
      r.path.endsWith(targetPath) ||
      targetPath.endsWith(r.path),
  )
  if (!hasRead) {
    missing.push(
      `Fact 2 (API surface): Use Read on "${targetPath}" to inspect the current public API before modifying it.`,
    )
  }

  // Fact 3 — Data schema referenced
  const last100Reads = state.reads.slice(-100)
  const hasSchema = last100Reads.some((r) => isSchemaFile(r.path))
  if (!hasSchema) {
    missing.push(
      'Fact 3 (schema): Use Read on a relevant types/schema file (e.g., types.ts, *.types.ts, schema*.ts, *.schema.*) to verify data contracts before editing.',
    )
  }

  // Fact 4 — Verbatim user instruction
  if (!state.userPromptSubmitted) {
    missing.push(
      'Fact 4 (user instruction): No user instruction has been recorded for this session. Clarify intent with the user before making edits.',
    )
  }

  return { satisfied: missing.length === 0, missing }
}

export function buildBlockMessage(
  targetPath: string,
  missing: string[],
): string {
  const lines = [
    `GateGuard: BLOCKED edit to "${targetPath}" — ${missing.length} of 4 required facts not yet observed.`,
    '',
    'Missing facts:',
    ...missing.map((m, i) => `  ${i + 1}. ${m}`),
    '',
    'Complete the above steps, then retry the edit.',
    'To disable GateGuard for this session: unset ANVIL_GATEGUARD or set workflow.gateguard=false in .anvil/anvil.config.json.',
  ]
  return lines.join('\n')
}
