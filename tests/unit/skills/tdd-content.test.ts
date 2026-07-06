import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const content = readFileSync(
  'skills/universal/test-driven-development.md',
  'utf-8',
)

describe('skills/universal/test-driven-development content', () => {
  it('contains testing anti-patterns section', () => {
    expect(content).toContain('## Testing Anti-Patterns')
  })

  it('covers the ice cream cone anti-pattern', () => {
    expect(content).toContain('Ice Cream Cone')
  })

  it('covers the mock-heavy anti-pattern', () => {
    expect(content).toContain('Mock Everything')
  })

  it('covers the test-the-implementation anti-pattern', () => {
    expect(content).toContain('implementation detail')
  })
})
