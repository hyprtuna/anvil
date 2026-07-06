import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const content = readFileSync('agents/code-reviewer.md', 'utf-8')

describe('agents/code-reviewer structured output', () => {
  it('defines JSON finding schema', () => {
    expect(content).toContain('"severity"')
    expect(content).toContain('"confidence"')
    expect(content).toContain('"message"')
    expect(content).toContain('"file"')
  })

  it('specifies minimum confidence as configurable', () => {
    expect(content).toContain('min_confidence')
  })

  it('includes machine-readable summary', () => {
    expect(content).toContain('"total_findings"')
    expect(content).toContain('"critical"')
  })
})
