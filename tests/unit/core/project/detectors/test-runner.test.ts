import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { detectTestRunners } from '../../../../../src/core/project/detectors/test-runner.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('runners')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('core/project/detectors/test-runner', () => {
  it('returns nothing detected when no manifest is present', async () => {
    const dir = join(tmp, 'empty')
    mkdirSync(dir, { recursive: true })
    const out = await detectTestRunners(dir)
    expect(out.filter((r) => r.detected)).toEqual([])
  })

  it('detects vitest via package.json devDependencies', async () => {
    const dir = join(tmp, 'vitest')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }),
    )
    const out = await detectTestRunners(dir)
    const names = out.filter((r) => r.detected).map((r) => r.name)
    expect(names).toContain('vitest')
  })

  it('detects vitest via vitest.config.ts even without dep entry', async () => {
    const dir = join(tmp, 'vitest-config')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'vitest.config.ts'), 'export default {}')
    writeFileSync(join(dir, 'package.json'), '{}')
    const out = await detectTestRunners(dir)
    const names = out.filter((r) => r.detected).map((r) => r.name)
    expect(names).toContain('vitest')
  })
})
