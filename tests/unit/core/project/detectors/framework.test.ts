import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { detectFrameworks } from '../../../../../src/core/project/detectors/framework.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('framework')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('core/project/detectors/framework', () => {
  it('returns empty when no manifest is present', async () => {
    const dir = join(tmp, 'empty')
    mkdirSync(dir, { recursive: true })
    const out = await detectFrameworks(dir)
    expect(out.filter((r) => r.detected)).toEqual([])
  })

  it('detects next.js + react from package.json deps', async () => {
    const dir = join(tmp, 'next')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }),
    )
    const out = await detectFrameworks(dir)
    const names = out.filter((r) => r.detected).map((r) => r.name)
    expect(names).toContain('next.js')
    expect(names).toContain('react')
  })

  it('does not detect frameworks absent from deps', async () => {
    const dir = join(tmp, 'plain')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
    )
    const out = await detectFrameworks(dir)
    const names = out.filter((r) => r.detected).map((r) => r.name)
    expect(names).not.toContain('next.js')
    expect(names).not.toContain('vue')
  })
})
