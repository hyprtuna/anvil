/**
 * Tests for required_reading injection (Plan 43 Phase I — Item 23).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  REQUIRED_READING_BYTE_CAP,
  buildRequiredReadingBlock,
  measureRequiredReadingBytes,
} from '../../../src/agents/required-reading.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

let tmp: string

beforeEach(() => {
  tmp = createTestTmpDir('required-reading')
  mkdirSync(join(tmp, 'skills'), { recursive: true })
})

describe('REQUIRED_READING_BYTE_CAP', () => {
  it('equals 8192 bytes (8 KB) — single source of truth', () => {
    expect(REQUIRED_READING_BYTE_CAP).toBe(8192)
  })
})

describe('buildRequiredReadingBlock', () => {
  it('returns null for empty/undefined input', () => {
    expect(buildRequiredReadingBlock(undefined, tmp)).toBeNull()
    expect(buildRequiredReadingBlock([], tmp)).toBeNull()
  })

  it('returns null when no listed file is readable', () => {
    expect(buildRequiredReadingBlock(['skills/missing.md'], tmp)).toBeNull()
  })

  it('renders fenced block with file headers and verbatim content', () => {
    writeFileSync(join(tmp, 'skills', 'a.md'), 'AAA\n')
    writeFileSync(join(tmp, 'skills', 'b.md'), 'BBB\n')
    const block = buildRequiredReadingBlock(['skills/a.md', 'skills/b.md'], tmp)
    expect(block).not.toBeNull()
    expect(block).toContain('<required_reading>')
    expect(block).toContain('### skills/a.md')
    expect(block).toContain('AAA')
    expect(block).toContain('### skills/b.md')
    expect(block).toContain('BBB')
    expect(block).toContain('</required_reading>')
  })

  it('truncates with explicit marker when total exceeds 8 KB (REQUIRED_READING_BYTE_CAP)', () => {
    const big = 'x'.repeat(REQUIRED_READING_BYTE_CAP + 100)
    writeFileSync(join(tmp, 'skills', 'big.md'), big)
    const block = buildRequiredReadingBlock(['skills/big.md'], tmp)
    expect(block).not.toBeNull()
    expect(block).toContain('truncated for budget')
    expect(block).toContain('truncated for 8 KB budget')
  })

  it('skips missing files silently and includes the readable ones', () => {
    writeFileSync(join(tmp, 'skills', 'present.md'), 'present\n')
    const block = buildRequiredReadingBlock(
      ['skills/missing.md', 'skills/present.md'],
      tmp,
    )
    expect(block).toContain('### skills/present.md')
    expect(block).toContain('present')
    expect(block).not.toContain('### skills/missing.md')
  })
})

describe('measureRequiredReadingBytes', () => {
  it('sums byte sizes of every readable listed file', () => {
    writeFileSync(join(tmp, 'skills', 'a.md'), 'aaa') // 3 bytes
    writeFileSync(join(tmp, 'skills', 'b.md'), 'bbbb') // 4 bytes
    expect(
      measureRequiredReadingBytes(['skills/a.md', 'skills/b.md'], tmp),
    ).toBe(7)
  })

  it('returns 0 for missing input', () => {
    expect(measureRequiredReadingBytes(undefined, tmp)).toBe(0)
    expect(measureRequiredReadingBytes([], tmp)).toBe(0)
  })

  it('skips missing files in the sum', () => {
    writeFileSync(join(tmp, 'skills', 'a.md'), 'aaa')
    expect(
      measureRequiredReadingBytes(['skills/a.md', 'skills/missing.md'], tmp),
    ).toBe(3)
  })
})
