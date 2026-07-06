import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { detectCI } from '../../../../../src/core/project/detectors/ci.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('ci')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('core/project/detectors/ci', () => {
  it('returns empty when no CI signals are present', () => {
    const dir = join(tmp, 'empty')
    mkdirSync(dir, { recursive: true })
    expect(detectCI(dir)).toEqual([])
  })

  it('detects github-actions via .github/workflows/', () => {
    const dir = join(tmp, 'gha')
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
    const out = detectCI(dir)
    expect(out.map((r) => r.name)).toContain('github-actions')
  })

  it('detects multiple CI providers when present together', () => {
    const dir = join(tmp, 'multi')
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
    writeFileSync(join(dir, '.travis.yml'), 'language: node_js')
    writeFileSync(join(dir, 'Jenkinsfile'), '')
    const out = detectCI(dir).map((r) => r.name)
    expect(out).toContain('github-actions')
    expect(out).toContain('travis')
    expect(out).toContain('jenkins')
  })
})
