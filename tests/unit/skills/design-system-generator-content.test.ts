import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const content = readFileSync(
  'skills/universal/design-system-generation.md',
  'utf-8',
)

describe('skills/universal/design-system-generation content', () => {
  it('has valid frontmatter', () => {
    expect(content).toContain('name: design-system-generation')
    expect(content).toContain('group: development')
  })

  it('defines industry presets', () => {
    expect(content).toContain('SaaS')
    expect(content).toContain('Fintech')
    expect(content).toContain('Healthcare')
    expect(content).toContain('E-commerce')
  })

  it('generates design tokens', () => {
    expect(content).toContain('color')
    expect(content).toContain('typography')
    expect(content).toContain('spacing')
  })

  it('includes CSS custom properties output format', () => {
    expect(content).toContain('--')
  })
})
