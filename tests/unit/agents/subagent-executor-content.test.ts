import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const content = readFileSync('agents/subagent-executor.md', 'utf-8')

describe('agents/subagent-executor content', () => {
  it('has correct CC subagent frontmatter fields', () => {
    expect(content).toContain('name: subagent-executor')
    // ANV-0206: tier may be at root (pre-migration) or under x-anvil (post-migration)
    expect(
      /^tier:\s+/m.test(content) || /^\s+tier:\s+/m.test(content),
      'subagent-executor.md must have tier: field (at root or under x-anvil)',
    ).toBe(true)
    expect(content).toMatch(/^permissionMode:\s+/m)
    expect(content).toMatch(/^color:\s+/m)
    expect(content).toMatch(/^tools:\s+\[/m)
  })

  it('defines two-stage review process', () => {
    expect(content).toContain('Stage 1: Spec Compliance')
    expect(content).toContain('Stage 2: Code Quality')
  })

  it('includes implementer dispatch instructions', () => {
    expect(content).toContain('Dispatch Implementer')
  })
})
