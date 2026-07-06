import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushOpenCodeConfigKnownKeysCheck } from '../../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const SKIP_DETAIL = 'not in an anvil project'

interface Check {
  name: string
  status: string
  detail: string
}

let tmpDir: string

beforeEach(() => {
  tmpDir = createTestTmpDir('doctor-oc')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true })
})

describe('pushOpenCodeConfigKnownKeysCheck', () => {
  it('returns skip when not in project', () => {
    const checks: Check[] = []
    pushOpenCodeConfigKnownKeysCheck(checks, tmpDir, false, SKIP_DETAIL)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('OpenCode config has known keys only')
    expect(checks[0].status).toBe('skip')
    expect(checks[0].detail).toBe(SKIP_DETAIL)
  })

  it('returns skip when .opencode/opencode.json does not exist', () => {
    const checks: Check[] = []
    pushOpenCodeConfigKnownKeysCheck(checks, tmpDir, true, SKIP_DETAIL)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('skip')
  })

  it('returns pass for a clean config with known keys', () => {
    mkdirSync(join(tmpDir, '.opencode'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.opencode', 'opencode.json'),
      JSON.stringify({ plugin: ['file://x'], skills: { paths: ['a'] } }),
    )
    const checks: Check[] = []
    pushOpenCodeConfigKnownKeysCheck(checks, tmpDir, true, SKIP_DETAIL)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('strict schema')
  })

  it('returns warn when skills block has unknown key lazy_load', () => {
    mkdirSync(join(tmpDir, '.opencode'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.opencode', 'opencode.json'),
      JSON.stringify({ skills: { paths: [], lazy_load: true } }),
    )
    const checks: Check[] = []
    pushOpenCodeConfigKnownKeysCheck(checks, tmpDir, true, SKIP_DETAIL)
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('lazy_load')
  })

  it('never returns fail status', () => {
    mkdirSync(join(tmpDir, '.opencode'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.opencode', 'opencode.json'),
      JSON.stringify({
        skills: { unknown1: 1, unknown2: 2, unknown3: 3, unknown4: 4 },
      }),
    )
    const checks: Check[] = []
    pushOpenCodeConfigKnownKeysCheck(checks, tmpDir, true, SKIP_DETAIL)
    expect(checks[0].status).not.toBe('fail')
    expect(checks[0].status).toBe('warn')
  })

  it('returns warn with parse error when config is malformed JSON', () => {
    mkdirSync(join(tmpDir, '.opencode'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.opencode', 'opencode.json'),
      'not valid json {',
    )
    const checks: Check[] = []
    pushOpenCodeConfigKnownKeysCheck(checks, tmpDir, true, SKIP_DETAIL)
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('unable to parse')
  })
})
