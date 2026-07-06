import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const path = 'skills/universal/dispatching-parallel-agents.md'
const content = readFileSync(path, 'utf-8')

function frontmatterBlock(src: string): string {
  const match = src.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error('missing frontmatter')
  return match[1]
}

describe('skills/universal/dispatching-parallel-agents content', () => {
  const fm = frontmatterBlock(content)

  it('has required frontmatter fields', () => {
    expect(fm).toMatch(/^name:\s*dispatching-parallel-agents\s*$/m)
    expect(fm).toMatch(/^description:\s*.+/m)
    // ANV-0206: tags may be at root (pre-migration) or under x-anvil: (post-migration)
    expect(fm).toMatch(/^\s*tags:\s*\[/m)
  })

  it('description mentions parallel/independent tasks', () => {
    const desc = fm.match(/^description:\s*(.+)$/m)?.[1] ?? ''
    expect(desc.toLowerCase()).toMatch(/parallel|independent/)
  })

  it('contains a When to Use section', () => {
    expect(content).toMatch(/##\s+When to Use/)
  })

  it('contains a When NOT to Use section', () => {
    expect(content).toMatch(/##\s+When NOT to Use/i)
  })

  it('documents the agent prompt structure', () => {
    expect(content).toMatch(/##\s+Agent Prompt Structure/i)
    expect(content.toLowerCase()).toContain('focused')
    expect(content.toLowerCase()).toContain('constraint')
  })

  it('warns about shared state', () => {
    expect(content.toLowerCase()).toContain('shared state')
  })

  it('calls out common mistakes', () => {
    expect(content).toMatch(/##\s+Common Mistakes/i)
  })
})
