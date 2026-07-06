import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const content = readFileSync('skills/universal/debugging.md', 'utf-8')

describe('skills/universal/debugging content', () => {
  it('contains root-cause-tracing subsection', () => {
    expect(content).toContain('## Root-Cause Tracing')
    expect(content).toContain('trace backward')
  })

  it('contains defense-in-depth subsection', () => {
    expect(content).toContain('## Defense in Depth')
    expect(content).toContain('validation at multiple layers')
  })

  it('contains condition-based-waiting subsection', () => {
    expect(content).toContain('## Condition-Based Waiting')
    expect(content).toContain('poll for condition')
  })
})
