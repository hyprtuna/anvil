/**
 * ANV-0181 — Unit tests for installer/dev-script-leakage doctor row.
 *
 * Fixtures are created on disk via createTestTmpDir. The check uses
 * ctx.anvilHome to locate the install tree and look for scripts/dev/ paths.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { devScriptLeakageCheck } from '../../../../../src/commands/cli/doctor-checks/installer.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../../../../src/commands/cli/doctor-registry.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

function makeCtx(anvilHome: string): DoctorCheckContext {
  return {
    cwd: '/tmp/test-cwd',
    home: '/tmp/test-home',
    anvilHome,
    inProject: false,
    skipDetail: 'not in project',
    installScope: 'unknown',
  }
}

describe('installer/dev-script-leakage', () => {
  it('emits pass when scripts/dev/ does not exist under anvilHome', async () => {
    const anvilHome = createTestTmpDir('anv-0181-pass')
    const rows: DoctorCheckRow[] = []
    await devScriptLeakageCheck.runner(makeCtx(anvilHome), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
    expect(rows[0]?.detail).toContain('no dev-script leakage')
  })

  it('emits fail when scripts/dev/ exists inside anvilHome via plugins/claude-code path', async () => {
    const anvilHome = createTestTmpDir('anv-0181-fail-plugin')
    const leakDir = join(anvilHome, 'plugins', 'claude-code', 'scripts', 'dev')
    await mkdir(leakDir, { recursive: true })
    await writeFile(join(leakDir, 'dev-doctor.ts'), '// leaked')

    const rows: DoctorCheckRow[] = []
    await devScriptLeakageCheck.runner(makeCtx(anvilHome), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('fail')
    expect(rows[0]?.detail).toContain('scripts/dev')
  })

  it('emits fail when a scripts/dev/ path exists anywhere under anvilHome', async () => {
    const anvilHome = createTestTmpDir('anv-0181-fail-generic')
    const leakDir = join(anvilHome, 'scripts', 'dev')
    await mkdir(leakDir, { recursive: true })
    await writeFile(join(leakDir, 'foo.ts'), '// leaked')

    const rows: DoctorCheckRow[] = []
    await devScriptLeakageCheck.runner(makeCtx(anvilHome), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('fail')
    expect(rows[0]?.detail).toContain('scripts/dev')
  })

  it('emits fail when scripts/dev/ exists under a novel install vector (opencode plugin path)', async () => {
    const anvilHome = createTestTmpDir('anv-0181-fail-opencode')
    const leakDir = join(anvilHome, 'plugins', 'opencode', 'scripts', 'dev')
    await mkdir(leakDir, { recursive: true })
    await writeFile(join(leakDir, 'foo.ts'), '// leaked from opencode plugin')

    const rows: DoctorCheckRow[] = []
    await devScriptLeakageCheck.runner(makeCtx(anvilHome), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('fail')
    expect(rows[0]?.detail).toContain('scripts/dev')
  })

  it('check has correct id, label, category, and fixHint', () => {
    expect(devScriptLeakageCheck.id).toBe('installer/dev-script-leakage')
    expect(devScriptLeakageCheck.label).toBe('Dev-script leakage')
    expect(devScriptLeakageCheck.category).toBe('installer')
    expect(devScriptLeakageCheck.fixHint).toBe('anvil init')
  })
})
