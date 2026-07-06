#!/usr/bin/env -S bunx tsx
/**
 * ANV-0138 — Surfaces audit CLI.
 *
 * Walks every Anvil surface (skill, agent, command, hook, rule) and applies
 * the five dimension checks defined in `src/core/audit/surfaces.ts`.
 *
 * Usage:
 *   bunx tsx scripts/audit/surfaces-audit.ts          # JSON to stdout
 *   bunx tsx scripts/audit/surfaces-audit.ts --markdown  # markdown table
 *
 * Exit codes:
 *   0 — every row passes every applicable dimension.
 *   2 — at least one row carries a `flag` status on at least one dimension.
 *
 * The script is read-only. It never writes to the working tree.
 */

import {
  type AuditMatrix,
  auditTree,
  isRowFlagged,
} from '../../src/core/audit/surfaces.js'

function renderMarkdown(matrix: AuditMatrix): string {
  const lines: string[] = []
  lines.push('# v0.14.0 Surfaces Audit — ANV-0138')
  lines.push('')
  lines.push(`Generated: ${matrix.generated_at}`)
  lines.push('')
  lines.push('## Counts')
  lines.push('')
  lines.push('| Kind | Count |')
  lines.push('|---|---|')
  for (const [k, v] of Object.entries(matrix.counts)) {
    lines.push(`| ${k} | ${v} |`)
  }
  lines.push('')
  lines.push('## Flagged per dimension')
  lines.push('')
  lines.push('| Dimension | Flagged |')
  lines.push('|---|---|')
  for (const [k, v] of Object.entries(matrix.flagged_per_dimension)) {
    lines.push(`| ${k} | ${v} |`)
  }
  lines.push('')
  lines.push('## Audit matrix')
  lines.push('')
  lines.push(
    '| surface | kind | templates | model | effort | tools | invocable | oc_visible | notes |',
  )
  lines.push('|---|---|---|---|---|---|---|---|---|')
  function cell(r: { status: string }): string {
    if (r.status === 'flag') return 'FLAG'
    if (r.status === 'pass') return 'ok'
    return 'n/a'
  }
  for (const row of matrix.rows) {
    const notes: string[] = []
    for (const [dim, res] of Object.entries({
      templates: row.templates,
      model: row.model,
      effort: row.effort,
      tools: row.tools,
      invocable: row.invocable,
      oc_visible: row.oc_visible,
    })) {
      if (res.status === 'flag') {
        notes.push(`${dim}: ${res.note}`)
      }
    }
    lines.push(
      `| ${row.surface} | ${row.kind} | ${cell(row.templates)} | ${cell(row.model)} | ${cell(row.effort)} | ${cell(row.tools)} | ${cell(row.invocable)} | ${cell(row.oc_visible)} | ${notes.join('; ')} |`,
    )
  }
  lines.push('')
  lines.push('## Remediation notes')
  lines.push('')
  lines.push(
    'Each flagged row above is a remediation candidate. Per ANV-0138 scope: the audit surfaces drift; it does **not** fix surfaces. File follow-up tickets per flagged row or batch by dimension.',
  )
  lines.push('')
  return lines.join('\n')
}

function main(): void {
  const cwd = process.cwd()
  const args = new Set(process.argv.slice(2))
  const matrix = auditTree({ cwd })

  if (args.has('--markdown') || args.has('-m')) {
    process.stdout.write(`${renderMarkdown(matrix)}\n`)
  } else {
    process.stdout.write(`${JSON.stringify(matrix, null, 2)}\n`)
  }

  let anyFlag = false
  for (const row of matrix.rows) {
    if (isRowFlagged(row)) {
      anyFlag = true
      break
    }
  }
  process.exit(anyFlag ? 2 : 0)
}

main()
