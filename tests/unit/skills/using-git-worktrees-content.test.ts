import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const path = 'skills/universal/using-git-worktrees.md'
const content = readFileSync(path, 'utf-8')

function frontmatterBlock(src: string): string {
  const match = src.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error('missing frontmatter')
  return match[1]
}

describe('skills/universal/using-git-worktrees content', () => {
  const fm = frontmatterBlock(content)

  it('has required frontmatter fields', () => {
    expect(fm).toMatch(/^name:\s*using-git-worktrees\s*$/m)
    expect(fm).toMatch(/^description:\s*.+/m)
    // ANV-0206: tags may be at root (pre-migration) or under x-anvil: (post-migration)
    expect(fm).toMatch(/^\s*tags:\s*\[/m)
  })

  it('advertises worktree isolation in description', () => {
    const desc = fm.match(/^description:\s*(.+)$/m)?.[1] ?? ''
    expect(desc.toLowerCase()).toContain('worktree')
  })

  it('documents directory selection priority', () => {
    expect(content).toContain('.worktrees')
    expect(content).toMatch(/CLAUDE\.md/)
  })

  it('includes gitignore safety verification', () => {
    expect(content).toContain('git check-ignore')
    expect(content).toMatch(/\.gitignore/)
  })

  it('shows the worktree creation command', () => {
    expect(content).toContain('git worktree add')
  })

  it('covers project setup and clean-baseline verification', () => {
    expect(content.toLowerCase()).toMatch(/setup|install/)
    expect(content.toLowerCase()).toMatch(/baseline|verify/)
  })
})
