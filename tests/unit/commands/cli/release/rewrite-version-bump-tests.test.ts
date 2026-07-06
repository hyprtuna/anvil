import {
  mkdirSync,
  readFileSync,
  writeFileSync as realWriteFileSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  emitHistoricalAntiStaleTest,
  emitPositiveAssertionTest,
} from '../../../../../src/core/release/emit-version-bump-tests.js'
import { rewriteVersionBumpTests } from '../../../../../src/core/release/rewrite-version-bump-tests.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

/**
 * CRITICAL invariant (load-bearing fix for PR #69 footgun):
 *
 * rewriteVersionBumpTests MUST call writeFileSync for the NEW file FIRST,
 * then for the OLD file SECOND.
 *
 * We verify this via a mock write function injected through the optional
 * `writeFile` parameter.
 */
describe('rewriteVersionBumpTests — call order (load-bearing PR #69 guard)', () => {
  it('calls writeFile(newPath) FIRST, then writeFile(oldPath) SECOND', () => {
    const callOrder: string[] = []
    const mockWrite = vi.fn((path: string, _content: string, _enc: string) => {
      callOrder.push(path)
    })

    const root = '/fake-root'
    rewriteVersionBumpTests(root, '0.13.3', '0.13.4', mockWrite)

    expect(mockWrite).toHaveBeenCalledTimes(2)
    // NEW file (v0.13.4) must be written first.
    expect(callOrder[0]).toContain('version-bump-v0.13.4.test.ts')
    // OLD file (v0.13.3) must be written second.
    expect(callOrder[1]).toContain('version-bump-v0.13.3.test.ts')
  })

  it('writes the positive-assertion content to the new file', () => {
    const written = new Map<string, string>()
    const mockWrite = vi.fn((path: string, content: string, _enc: string) => {
      written.set(path, content)
    })

    rewriteVersionBumpTests('/root', '0.13.3', '0.13.4', mockWrite)

    const newPath = [...written.keys()].find((k) => k.includes('v0.13.4'))
    expect(newPath).toBeDefined()
    expect(written.get(newPath!)).toBe(
      emitPositiveAssertionTest('0.13.4', '0.13.3'),
    )
  })

  it('writes the historical anti-stale content to the old file', () => {
    const written = new Map<string, string>()
    const mockWrite = vi.fn((path: string, content: string, _enc: string) => {
      written.set(path, content)
    })

    rewriteVersionBumpTests('/root', '0.13.3', '0.13.4', mockWrite)

    const oldPath = [...written.keys()].find((k) => k.includes('v0.13.3'))
    expect(oldPath).toBeDefined()
    expect(written.get(oldPath!)).toBe(
      emitHistoricalAntiStaleTest('0.13.4', '0.13.3'),
    )
  })
})

describe('rewriteVersionBumpTests — real filesystem integration', () => {
  it('creates new file and overwrites old file on disk', () => {
    const root = createTestTmpDir('rewrite-fs')
    const testDir = join(root, 'tests', 'unit', 'release')
    mkdirSync(testDir, { recursive: true })
    realWriteFileSync(
      join(testDir, 'version-bump-v1.0.0.test.ts'),
      '// original placeholder',
      'utf-8',
    )

    rewriteVersionBumpTests(root, '1.0.0', '1.0.1')

    const newContent = readFileSync(
      join(testDir, 'version-bump-v1.0.1.test.ts'),
      'utf-8',
    )
    expect(newContent).toContain("toBe('1.0.1')")
    // The new file DOES contain not.toBe('1.0.0') as a stale check.
    // What must not appear is a direct positive assertion without .not
    const positiveOldAssertions = newContent
      .split('\n')
      .filter((l) => l.includes(".toBe('1.0.0')") && !l.includes('.not.'))
    expect(positiveOldAssertions).toHaveLength(0)

    const oldContent = readFileSync(
      join(testDir, 'version-bump-v1.0.0.test.ts'),
      'utf-8',
    )
    expect(oldContent).toContain('historical')
    expect(oldContent).not.toContain('toBe(mkt.version)') // no sync assertion in historical

    rmSync(root, { recursive: true })
  })
})
