/**
 * ANV-0153 — Unit tests for pushPrePushParityCheck.
 *
 * Exercises the doctor row pusher against the exposed pure helper logic,
 * verifying that the correct Check rows are appended.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CANONICAL_PRE_PUSH,
  pushPrePushParityCheck,
} from '../../../../src/commands/cli/doctor.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CheckRow {
  name: string
  status: string
  detail: string
  expectedAbsence?: boolean
}

let tmpDir: string

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `anv-0153-doctor-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function writePackageJson(content: unknown): void {
  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify(content), 'utf-8')
}

// ---------------------------------------------------------------------------
// pushPrePushParityCheck
// ---------------------------------------------------------------------------

describe('pushPrePushParityCheck', () => {
  it('appends a pass row when hook equals canonical', () => {
    writePackageJson({
      'simple-git-hooks': { 'pre-push': CANONICAL_PRE_PUSH },
    })
    const checks: CheckRow[] = []
    pushPrePushParityCheck(checks, tmpDir)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Pre-push parity')
    expect(checks[0].status).toBe('pass')
    expect(checks[0].expectedAbsence).toBeFalsy()
  })

  it('appends a warn row when hook is the legacy chain', () => {
    writePackageJson({
      'simple-git-hooks': {
        'pre-push':
          'bunx tsx scripts/ci/check-rebase-base.ts && bun run test && bun run tsc --noEmit',
      },
    })
    const checks: CheckRow[] = []
    pushPrePushParityCheck(checks, tmpDir)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain(CANONICAL_PRE_PUSH)
  })

  it('appends a skip row when package.json is missing', () => {
    const checks: CheckRow[] = []
    pushPrePushParityCheck(checks, tmpDir)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('skip')
    expect(checks[0].expectedAbsence).toBe(true)
  })

  it('appends a skip row when simple-git-hooks block is absent', () => {
    writePackageJson({ name: 'test' })
    const checks: CheckRow[] = []
    pushPrePushParityCheck(checks, tmpDir)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('skip')
  })

  it('appends exactly one row per call', () => {
    writePackageJson({
      'simple-git-hooks': { 'pre-push': CANONICAL_PRE_PUSH },
    })
    const checks: CheckRow[] = []
    pushPrePushParityCheck(checks, tmpDir)
    pushPrePushParityCheck(checks, tmpDir)
    expect(checks).toHaveLength(2)
  })
})
