import { describe, expect, it } from 'vitest'
import {
  diffLines,
  formatFileDiff,
} from '../../../../src/commands/cli/common/diff.js'

describe('diffLines', () => {
  it('returns empty array for two empty strings', () => {
    expect(diffLines('', '')).toEqual([])
  })

  it('marks all lines as added when old is empty', () => {
    const result = diffLines('', 'a\nb\n')
    expect(result).toContain('+a')
    expect(result).toContain('+b')
    expect(result.every((l) => l.startsWith('+'))).toBe(true)
  })

  it('marks all lines as removed when new is empty', () => {
    const result = diffLines('a\nb\n', '')
    expect(result).toContain('-a')
    expect(result).toContain('-b')
    expect(result.every((l) => l.startsWith('-'))).toBe(true)
  })

  it('marks context lines with a space when identical', () => {
    const result = diffLines('a\nb\nc\n', 'a\nb\nc\n')
    expect(result).toEqual([' a', ' b', ' c'])
  })

  it('correctly marks removed and added lines with shared context', () => {
    const result = diffLines('a\nb\nc\n', 'a\nd\nc\n')
    expect(result).toContain(' a')
    expect(result).toContain('-b')
    expect(result).toContain('+d')
    expect(result).toContain(' c')
  })

  it('handles strings without trailing newlines', () => {
    const result = diffLines('hello', 'world')
    expect(result).toContain('-hello')
    expect(result).toContain('+world')
  })

  it('handles multi-line insertion in the middle', () => {
    const result = diffLines('a\nc\n', 'a\nb\nc\n')
    expect(result).toContain(' a')
    expect(result).toContain('+b')
    expect(result).toContain(' c')
  })

  it('handles multi-line deletion', () => {
    const result = diffLines('a\nb\nc\n', 'a\nc\n')
    expect(result).toContain(' a')
    expect(result).toContain('-b')
    expect(result).toContain(' c')
  })
})

describe('formatFileDiff', () => {
  it('returns empty string when old and new are identical', () => {
    expect(formatFileDiff('foo.txt', 'same\n', 'same\n')).toBe('')
  })

  it('returns empty string when both are empty strings', () => {
    expect(formatFileDiff('foo.txt', '', '')).toBe('')
  })

  it('includes file headers when content differs', () => {
    const result = formatFileDiff('foo.txt', 'hello\n', 'world\n')
    expect(result).toContain('--- a/foo.txt')
    expect(result).toContain('+++ b/foo.txt')
    expect(result).not.toBe('')
  })

  it('includes hunk header with correct line counts', () => {
    const result = formatFileDiff('foo.txt', 'hello\n', 'world\n')
    expect(result).toContain('@@ -1,1 +1,1 @@')
  })

  it('includes diff lines in output', () => {
    const result = formatFileDiff('foo.txt', 'hello\n', 'world\n')
    expect(result).toContain('-hello')
    expect(result).toContain('+world')
  })

  it('handles new file (empty old content)', () => {
    const result = formatFileDiff('new.txt', '', 'line1\nline2\n')
    expect(result).toContain('--- a/new.txt')
    expect(result).toContain('@@ -0,0 +1,2 @@')
    expect(result).toContain('+line1')
    expect(result).toContain('+line2')
  })

  it('handles deleted file (empty new content)', () => {
    const result = formatFileDiff('old.txt', 'line1\n', '')
    expect(result).toContain('+++ b/old.txt')
    expect(result).toContain('-line1')
  })

  it('preserves file path in headers', () => {
    const result = formatFileDiff('path/to/file.ts', 'old\n', 'new\n')
    expect(result).toContain('--- a/path/to/file.ts')
    expect(result).toContain('+++ b/path/to/file.ts')
  })
})
