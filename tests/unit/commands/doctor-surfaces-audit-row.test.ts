/**
 * ANV-0138 — Doctor row `surfaces-audit/dimension-drift`.
 *
 * Verifies the row:
 *  - exists in the check list after invocation
 *  - emits `pass` when the tree is clean
 *  - emits `warn` when at least one flag fires
 *  - emits `skip` when skills/ is absent
 *  - matches the headline counts from the audit-script JSON output
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pushSurfacesAuditDriftCheck } from '../../../src/commands/cli/doctor-checks/surfaces-audit.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..', '..')

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

describe('doctor surfaces-audit/dimension-drift', () => {
  it('emits skip when skills/ is missing', () => {
    const tmp = createTestTmpDir('audit-doctor')
    try {
      const checks: Check[] = []
      pushSurfacesAuditDriftCheck(checks, tmp)
      expect(checks).toHaveLength(1)
      expect(checks[0].name).toBe('surfaces-audit/dimension-drift')
      expect(checks[0].status).toBe('skip')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('emits pass when every fixture surface is clean', () => {
    // ANV-0212: model/effort dimensions now check the bundled registry.
    // Use a skill name that is in BUNDLED_SKILL_REGISTRY so those dimensions pass.
    // 'planning' is a known registry entry (planning group → opus/high).
    const tmp = createTestTmpDir('audit-doctor')
    try {
      mkdirSync(join(tmp, 'skills', 'universal'), { recursive: true })
      writeFileSync(
        join(tmp, 'skills', 'universal', 'planning.md'),
        [
          '---',
          'name: planning',
          'group: planning',
          'description: A clean fixture using a registry-known skill name',
          'tools: [Read]',
          '---',
          'Body.',
        ].join('\n'),
      )
      const checks: Check[] = []
      pushSurfacesAuditDriftCheck(checks, tmp)
      expect(checks[0].status).toBe('pass')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('emits warn when at least one fixture surface flags a dimension', () => {
    const tmp = createTestTmpDir('audit-doctor')
    try {
      mkdirSync(join(tmp, 'skills', 'universal', 'rules'), { recursive: true })
      // Helper-path skill missing user-invocable: flagged on invocable.
      writeFileSync(
        join(tmp, 'skills', 'universal', 'rules', 'bad.md'),
        [
          '---',
          'name: bad-rule',
          'preferred_model: haiku',
          'preferred_effort: low',
          'group: rules',
          'description: A rule overlay that should not be discoverable',
          '---',
          'Body.',
        ].join('\n'),
      )
      const checks: Check[] = []
      pushSurfacesAuditDriftCheck(checks, tmp)
      expect(checks[0].status).toBe('warn')
      expect(checks[0].detail).toMatch(/invocable=1/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('agrees with the audit script on counts (live tree)', () => {
    const script = join(repoRoot, 'scripts', 'audit', 'surfaces-audit.ts')
    const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')
    // Redirect via shell (vitest fork pool truncates large spawnSync stdout).
    const tmp = createTestTmpDir('audit-script-doctor')
    const outPath = join(tmp, 'audit.json')
    let matrix: {
      flagged_per_dimension: Record<string, number>
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
      matrix = JSON.parse(readFileSync(outPath, 'utf-8'))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }

    const checks: Check[] = []
    pushSurfacesAuditDriftCheck(checks, repoRoot)
    expect(checks).toHaveLength(1)
    const row = checks[0]

    const totalFlags = Object.values(matrix.flagged_per_dimension).reduce(
      (acc: number, n) => acc + (n as number),
      0,
    )
    if (totalFlags === 0) {
      expect(row.status).toBe('pass')
    } else {
      expect(row.status).toBe('warn')
      // detail should mention every non-zero dimension count
      for (const [dim, n] of Object.entries(matrix.flagged_per_dimension)) {
        if ((n as number) > 0) {
          expect(row.detail).toMatch(new RegExp(`${dim}=${n}`))
        }
      }
    }
  }, 60_000)
})
