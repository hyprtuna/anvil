import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

async function readSkill(rel: string): Promise<string> {
  return readFile(join(ROOT, 'skills/universal/ui', rel), 'utf-8')
}

describe('skills/universal/ui/style-selection', () => {
  it('has valid Anvil frontmatter', async () => {
    const c = await readSkill('style-selection.md')
    expect(c).toMatch(/^---\n[\s\S]+?\n---\n/)
    expect(c).toMatch(/^name: style-selection$/m)
    expect(c).toMatch(/^description: /m)
  })

  it('covers the required style families', async () => {
    const c = await readSkill('style-selection.md')
    for (const style of [
      'Brutalist',
      'Soft UI',
      'Glassmorphism',
      'Neomorphism',
      'Editorial',
      'Minimalist',
    ]) {
      expect(c).toContain(style)
    }
  })

  it('lists anti-patterns explicitly (purple/pink gradients, Inter-only, etc.)', async () => {
    const c = await readSkill('style-selection.md')
    expect(c.toLowerCase()).toContain('anti-pattern')
    expect(c.toLowerCase()).toMatch(/purple.*gradient|gradient.*purple/)
    expect(c).toContain('Inter')
  })

  it('includes industry-to-style mapping', async () => {
    const c = await readSkill('style-selection.md')
    expect(c.toLowerCase()).toContain('industry')
    for (const industry of [
      'SaaS',
      'Fintech',
      'Wellness',
      'Editorial',
      'Developer Tools',
    ]) {
      expect(c).toContain(industry)
    }
  })

  it('references sibling skills', async () => {
    const c = await readSkill('style-selection.md')
    expect(c).toContain('color-palette-design')
    expect(c).toContain('typography-pairings')
  })
})

describe('skills/universal/ui/color-palette-design', () => {
  it('has valid frontmatter', async () => {
    const c = await readSkill('color-palette-design.md')
    expect(c).toMatch(/^name: color-palette-design$/m)
  })
  it('covers WCAG contrast guidance with concrete ratios', async () => {
    const c = await readSkill('color-palette-design.md')
    expect(c).toContain('4.5:1')
    expect(c).toMatch(/3:1|3.0:1/)
    expect(c).toMatch(/WCAG\s*AA/)
  })
  it('covers role-based palette structure (primary/secondary/cta/bg/text/border/success/warning/error)', async () => {
    const c = await readSkill('color-palette-design.md')
    for (const role of [
      'primary',
      'secondary',
      'CTA',
      'background',
      'text',
      'border',
      'success',
      'warning',
      'error',
    ]) {
      expect(c.toLowerCase()).toContain(role.toLowerCase())
    }
  })
  it('covers dark-mode derivation strategy', async () => {
    const c = await readSkill('color-palette-design.md')
    expect(c.toLowerCase()).toContain('dark mode')
  })
})

describe('skills/universal/ui/typography-pairings', () => {
  it('has valid frontmatter', async () => {
    const c = await readSkill('typography-pairings.md')
    expect(c).toMatch(/^name: typography-pairings$/m)
  })
  it('lists at least 8 industry pairings', async () => {
    const c = await readSkill('typography-pairings.md')
    for (const i of [
      'SaaS',
      'Fintech',
      'Editorial',
      'Wellness',
      'E-commerce',
      'Developer Tools',
      'Healthcare',
      'Gaming',
    ]) {
      expect(c).toContain(i)
    }
  })
  it('warns against Inter-only as a pattern', async () => {
    const c = await readSkill('typography-pairings.md')
    expect(c).toMatch(/Inter.only|Inter\s+only|just Inter/i)
  })
  it('includes a scale / modular scale section', async () => {
    const c = await readSkill('typography-pairings.md')
    expect(c.toLowerCase()).toContain('scale')
  })
})

describe('skills/universal/ui/ux-reasoning-rules', () => {
  it('has valid frontmatter', async () => {
    const c = await readSkill('ux-reasoning-rules.md')
    expect(c).toMatch(/^name: ux-reasoning-rules$/m)
  })
  it('covers at least 20 rules numbered 1..N', async () => {
    const c = await readSkill('ux-reasoning-rules.md')
    const numbered = c.match(/^###\s*\d+\./gm) ?? []
    expect(numbered.length).toBeGreaterThanOrEqual(20)
  })
  it('covers Fitts, Hick, Miller by name', async () => {
    const c = await readSkill('ux-reasoning-rules.md')
    expect(c).toContain('Fitts')
    expect(c).toContain('Hick')
    expect(c).toContain('Miller')
  })
  it('covers empty / loading / error states explicitly', async () => {
    const c = await readSkill('ux-reasoning-rules.md')
    expect(c.toLowerCase()).toContain('empty state')
    expect(c.toLowerCase()).toContain('loading state')
    expect(c.toLowerCase()).toContain('error state')
  })
})

describe('cross-linking', () => {
  it('ui-design links to the four sub-skills', async () => {
    const c = await readFile(
      join(ROOT, 'skills/universal/ui-design.md'),
      'utf-8',
    )
    for (const s of [
      'style-selection',
      'color-palette-design',
      'typography-pairings',
      'ux-reasoning-rules',
    ]) {
      expect(c).toContain(s)
    }
  })
  it('design-system-generation links to style-selection + palette + typography', async () => {
    const c = await readFile(
      join(ROOT, 'skills/universal/design-system-generation.md'),
      'utf-8',
    )
    for (const s of [
      'style-selection',
      'color-palette-design',
      'typography-pairings',
    ]) {
      expect(c).toContain(s)
    }
  })
})
