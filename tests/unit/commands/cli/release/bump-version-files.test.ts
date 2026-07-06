import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bumpVersionFiles } from '../../../../../src/core/release/bump-version-files.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

function makeFixture(
  packageVersion: string,
  marketplaceVersion: string,
): string {
  const root = createTestTmpDir('bump-test')
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'anvil', version: packageVersion }, null, 2)}\n`,
    'utf-8',
  )
  writeFileSync(
    join(root, 'marketplace.json'),
    `${JSON.stringify({ name: 'anvil', version: marketplaceVersion }, null, 2)}\n`,
    'utf-8',
  )
  return root
}

describe('bumpVersionFiles', () => {
  it('updates version in package.json from old to new', () => {
    const root = makeFixture('0.13.3', '0.13.3')
    bumpVersionFiles(root, '0.13.3', '0.13.4')
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf-8'),
    ) as { version: string }
    expect(pkg.version).toBe('0.13.4')
    rmSync(root, { recursive: true })
  })

  it('updates version in marketplace.json from old to new', () => {
    const root = makeFixture('0.13.3', '0.13.3')
    bumpVersionFiles(root, '0.13.3', '0.13.4')
    const mkt = JSON.parse(
      readFileSync(join(root, 'marketplace.json'), 'utf-8'),
    ) as { version: string }
    expect(mkt.version).toBe('0.13.4')
    rmSync(root, { recursive: true })
  })

  it('throws when the from version is not found in package.json', () => {
    const root = makeFixture('0.13.3', '0.13.3')
    expect(() => bumpVersionFiles(root, '0.99.0', '1.0.0')).toThrow(
      'could not find',
    )
    rmSync(root, { recursive: true })
  })

  it('preserves file content structure (does not reformat JSON)', () => {
    const root = makeFixture('1.2.3', '1.2.3')
    const originalPkg = readFileSync(join(root, 'package.json'), 'utf-8')
    bumpVersionFiles(root, '1.2.3', '1.2.4')
    const updated = readFileSync(join(root, 'package.json'), 'utf-8')
    // Ensure the structure is mostly the same (only version changed)
    expect(updated).toContain('"name": "anvil"')
    expect(updated).toContain('"version": "1.2.4"')
    expect(updated).not.toContain('"version": "1.2.3"')
    // Trailing newline preserved
    expect(updated.endsWith('\n')).toBe(originalPkg.endsWith('\n'))
    rmSync(root, { recursive: true })
  })
})
