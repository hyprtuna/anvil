/**
 * Plan 39 Phase G — build-error-resolver frontmatter validation.
 *
 * Parses agents/build-error-resolver.md through the AgentFrontmatter Zod
 * schema and asserts the canonical field values for this agent.
 */
import { readFileSync } from 'node:fs'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { AgentFrontmatter } from '../../../src/core/types.js'

const content = readFileSync('agents/build-error-resolver.md', 'utf-8')
const { data: raw } = matter(content)
const parsed = AgentFrontmatter.parse(raw)

describe('agents/build-error-resolver frontmatter', () => {
  it('parses without error via AgentFrontmatter schema', () => {
    expect(parsed).toBeDefined()
  })

  it('has tier: coding', () => {
    // ANV-0206: tier may be at root (pre-migration) or under x-anvil (post-migration)
    const effectiveTier = parsed.tier ?? parsed['x-anvil']?.tier
    expect(effectiveTier).toBe('coding')
  })

  it('has permissionMode: default', () => {
    expect(parsed.permissionMode).toBe('default')
  })

  it('has color: yellow', () => {
    expect(parsed.color).toBe('yellow')
  })

  it('tools list contains Read, Edit, Bash, Glob, Grep', () => {
    expect(parsed.tools).toEqual(
      expect.arrayContaining(['Read', 'Edit', 'Bash', 'Glob', 'Grep']),
    )
    expect(parsed.tools).toHaveLength(5)
  })

  it('description starts with "Use when"', () => {
    expect(parsed.description).toMatch(/^Use when/)
  })

  it('name matches filename stem', () => {
    expect(parsed.name).toBe('build-error-resolver')
  })
})

describe('agents/build-error-resolver body structure', () => {
  it('contains announce line', () => {
    expect(content).toContain('**Announce:**')
  })

  it('contains What this agent does section', () => {
    expect(content).toContain('## What this agent does')
  })

  it('contains Out of scope section', () => {
    expect(content).toContain('## Out of scope')
  })

  it('contains Loop section', () => {
    expect(content).toContain('## Loop')
  })

  it('contains Verification section', () => {
    expect(content).toContain('## Verification')
  })

  it('contains closing status line', () => {
    expect(content).toMatch(/status:\s*(DONE|BLOCKED)/)
  })
})
