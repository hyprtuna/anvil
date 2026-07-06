/**
 * v0.10.9 T-001-followup — `scanDocTestsForValuePinning` flags doc tests
 * that hard-pin a surface count (e.g., "15 skills") or a release version
 * literal (e.g., "v0.10.4"). Both rot every release and create silent
 * doc-staleness once the assertion stops matching reality.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { scanDocTestsForValuePinning } from '../../../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('doctor — doc tests are structural (no value-pinning) [T-001-followup]', () => {
  let tmp: string
  let docsDir: string

  beforeEach(() => {
    tmp = createTestTmpDir('doc-test-structural')
    docsDir = join(tmp, 'tests', 'unit', 'docs')
    mkdirSync(docsDir, { recursive: true })
  })

  it('passes when all doc tests are structural', () => {
    writeFileSync(
      join(docsDir, 'clean.test.ts'),
      `import { expect, it } from 'vitest'
it('has a section', () => {
  expect(content).toMatch(/## Skills/)
})`,
      'utf-8',
    )
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('pass')
    expect(r.offenders).toEqual([])
    expect(r.filesScanned).toBe(1)
  })

  it('fails when a doc test pins a literal count of skills', () => {
    writeFileSync(
      join(docsDir, 'count-pin.test.ts'),
      `import { expect, it } from 'vitest'
it('has 15 skills', () => {
  expect(skills).toHaveLength(15)
})`,
      'utf-8',
    )
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('fail')
    expect(r.offenders.length).toBeGreaterThan(0)
    expect(r.offenders[0]).toContain('count-pin.test.ts')
    expect(r.offenders[0]).toContain('count pin')
  })

  it('fails when a doc test pins a version literal', () => {
    writeFileSync(
      join(docsDir, 'version-pin.test.ts'),
      `import { expect, it } from 'vitest'
it('mentions v0.10.4', () => {
  expect(content).toContain('v0.10.4')
})`,
      'utf-8',
    )
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('fail')
    expect(r.offenders.some((o) => o.includes('version pin'))).toBe(true)
  })

  it('exempts version literals when the filename itself is version-pinned (historical release artifact)', () => {
    writeFileSync(
      join(docsDir, 'v0.10.2-content-overlays-md-sections.test.ts'),
      `import { expect, it } from 'vitest'
const DOC_PATH = 'docs/anvil/v0.10.2-content-overlays.md'
it('has H1 referencing v0.10.2', () => {
  expect(content).toMatch(/v0\\.10\\.2/)
})`,
      'utf-8',
    )
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('pass')
  })

  it('exempts version literals on lines that reference CHANGELOG', () => {
    writeFileSync(
      join(docsDir, 'changelog-ref.test.ts'),
      `import { expect, it } from 'vitest'
it('matches CHANGELOG.md v0.10.4 entry', () => {
  expect(true).toBe(true)
})`,
      'utf-8',
    )
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('pass')
  })

  it('reports counts adjacent to other surface nouns', () => {
    writeFileSync(
      join(docsDir, 'agents-pin.test.ts'),
      `it('has 28 agents', () => {})`,
      'utf-8',
    )
    writeFileSync(
      join(docsDir, 'hooks-pin.test.ts'),
      `it('has 17 hooks', () => {})`,
      'utf-8',
    )
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('fail')
    expect(r.offenders.length).toBe(2)
  })

  it('returns pass when no doc tests directory exists', () => {
    rmSync(docsDir, { recursive: true })
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('pass')
    expect(r.filesScanned).toBe(0)
  })

  it('mixes clean and offending files correctly', () => {
    writeFileSync(
      join(docsDir, 'ok.test.ts'),
      `it('has a heading', () => {
  expect(content).toMatch(/^# /m)
})`,
      'utf-8',
    )
    writeFileSync(
      join(docsDir, 'bad.test.ts'),
      `it('has 12 commands', () => {})`,
      'utf-8',
    )
    const r = scanDocTestsForValuePinning(docsDir)
    expect(r.status).toBe('fail')
    expect(r.filesScanned).toBe(2)
    expect(r.offenders).toHaveLength(1)
    expect(r.offenders[0]).toContain('bad.test.ts')
  })
})
