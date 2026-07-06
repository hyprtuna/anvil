/**
 * ANV-0138 — Integration test: run the surfaces-audit script against the
 * live working tree and verify it produces valid structured output.
 *
 * Asserts:
 *   - script exits with 0 or 2 (never crashes).
 *   - stdout is parseable JSON with the expected shape.
 *   - counts include at least one surface from every kind.
 *   - any flagged dimension count is consistent with the rows array.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

describe('surfaces-audit script (integration)', () => {
  it('runs against the live tree and emits structured JSON', () => {
    const script = join(repoRoot, 'scripts', 'audit', 'surfaces-audit.ts')
    const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')
    // Redirect stdout to a temp file: vitest's fork pool truncates large
    // spawnSync stdout (>~128KB) but the on-disk redirect is unaffected.
    const tmp = createTestTmpDir('audit-script')
    const outPath = join(tmp, 'audit.json')
    let matrix: {
      counts: Record<string, number>
      flagged_per_dimension: Record<string, number>
      rows: unknown[]
    }
    try {
      const result = spawnSync(
        'sh',
        ['-c', `'${tsxBin}' '${script}' > '${outPath}'`],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          env: process.env,
        },
      )
      expect([0, 2]).toContain(result.status ?? -1)
      const raw = readFileSync(outPath, 'utf-8')
      matrix = JSON.parse(raw)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
    expect(matrix).toHaveProperty('counts')
    expect(matrix).toHaveProperty('flagged_per_dimension')
    expect(matrix).toHaveProperty('rows')
    expect(Array.isArray(matrix.rows)).toBe(true)

    // At minimum, audit should see some skills and agents.
    expect(matrix.counts.skill).toBeGreaterThan(0)
    expect(matrix.counts.agent).toBeGreaterThan(0)

    // Internal consistency: rows that carry a `flag` for a dimension D
    // must match the count in flagged_per_dimension[D].
    const dims = [
      'templates',
      'model',
      'effort',
      'tools',
      'invocable',
      'oc_visible',
    ] as const
    for (const dim of dims) {
      const counted = matrix.rows.filter(
        (r: { [k: string]: { status: string } }) => r[dim].status === 'flag',
      ).length
      expect(counted).toBe(matrix.flagged_per_dimension[dim])
    }
  }, 60_000)
})
