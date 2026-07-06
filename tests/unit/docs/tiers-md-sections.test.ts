import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ANV-0131: moved from docs/anvil/tiers.md to .anvil/specs/tiers.md
const TIERS_MD_PATH = join(process.cwd(), '.anvil/specs/tiers.md')

const REQUIRED_SECTIONS = [
  '## Overview',
  '## The six tiers',
  '## Effort support per model',
  '## Tier injection',
  '## Conflict resolution',
  '## Provider portability via alias override',
  '## When to use which tier',
]

describe('.anvil/specs/tiers.md — section headings', () => {
  let content: string

  it('file exists and is non-empty', () => {
    content = readFileSync(TIERS_MD_PATH, 'utf8')
    expect(content.length).toBeGreaterThan(0)
  })

  it('has H1 title', () => {
    content ??= readFileSync(TIERS_MD_PATH, 'utf8')
    expect(content).toContain('# Anvil tiers')
  })

  for (const heading of REQUIRED_SECTIONS) {
    it(`contains section "${heading}"`, () => {
      content ??= readFileSync(TIERS_MD_PATH, 'utf8')
      expect(content).toContain(heading)
    })
  }

  it('stays under 250 lines', () => {
    content ??= readFileSync(TIERS_MD_PATH, 'utf8')
    const lineCount = content.split('\n').length
    expect(lineCount).toBeLessThanOrEqual(250)
  })
})
