import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prependChangelog } from '../../../../../src/core/release/prepend-changelog.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

const SAMPLE_SLATE = `# v0.13.4

Status: planned

## Slate

### Added

- ANV-0154: anvil release command.

### Fixed

- ANV-0157: scope detection.
`

const SAMPLE_CHANGELOG = `# Changelog

## [0.13.3] — 2026-05-14

Some content.

## [0.13.2] — 2026-05-11

Older content.
`

function makeFixture(): { root: string; slatePath: string } {
  const root = createTestTmpDir('changelog')
  const releasesDir = join(root, 'docs', 'anvil', 'releases')
  mkdirSync(releasesDir, { recursive: true })
  writeFileSync(join(root, 'CHANGELOG.md'), SAMPLE_CHANGELOG, 'utf-8')
  const slatePath = join(releasesDir, 'v0.13.4.md')
  writeFileSync(slatePath, SAMPLE_SLATE, 'utf-8')
  return { root, slatePath }
}

describe('prependChangelog', () => {
  it('inserts the new version heading before the current top entry', () => {
    const { root, slatePath } = makeFixture()
    prependChangelog(root, '0.13.4', '2026-05-20', slatePath)
    const content = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8')
    const idx0134 = content.indexOf('## [0.13.4]')
    const idx0133 = content.indexOf('## [0.13.3]')
    expect(idx0134).toBeGreaterThanOrEqual(0)
    expect(idx0133).toBeGreaterThanOrEqual(0)
    expect(idx0134).toBeLessThan(idx0133)
    rmSync(root, { recursive: true })
  })

  it('includes the iso date in the new heading', () => {
    const { root, slatePath } = makeFixture()
    prependChangelog(root, '0.13.4', '2026-05-20', slatePath)
    const content = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8')
    expect(content).toContain('## [0.13.4] — 2026-05-20')
    rmSync(root, { recursive: true })
  })

  it('pulls Added content from the slate', () => {
    const { root, slatePath } = makeFixture()
    prependChangelog(root, '0.13.4', '2026-05-20', slatePath)
    const content = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8')
    expect(content).toContain('ANV-0154')
    rmSync(root, { recursive: true })
  })

  it('pulls Fixed content from the slate', () => {
    const { root, slatePath } = makeFixture()
    prependChangelog(root, '0.13.4', '2026-05-20', slatePath)
    const content = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8')
    expect(content).toContain('ANV-0157')
    rmSync(root, { recursive: true })
  })

  it('preserves the existing changelog entries', () => {
    const { root, slatePath } = makeFixture()
    prependChangelog(root, '0.13.4', '2026-05-20', slatePath)
    const content = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8')
    expect(content).toContain('## [0.13.3]')
    expect(content).toContain('## [0.13.2]')
    rmSync(root, { recursive: true })
  })
})
