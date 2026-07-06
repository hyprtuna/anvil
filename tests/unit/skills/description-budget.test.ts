import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SkillFrontmatter } from '../../../src/core/types.js'

/**
 * ANV-0042 — Description-budget tests.
 *
 * Claude Code silently drops selector keywords past its 1,536-char per-entry
 * cap. Anvil hard-caps at 512 (Warp parity, MAX_SKILL_DESCRIPTION_CHARS) and
 * the doctor `description budget` row warns at 280+.
 *
 * - <280 chars : clean (no warning, no failure).
 * - 280-512    : warning band (doctor surfaces; Zod still passes).
 * - >512       : Zod schema rejects.
 */

const baseValid = {
  name: 'sample-skill',
  kind: 'atomic' as const,
  group: 'review',
  preferred_model: 'sonnet',
  preferred_effort: 'medium' as const,
}

describe('SkillFrontmatter.description budget', () => {
  it('accepts a description well under 280 chars (clean)', () => {
    const desc = 'Use when the user requests a code review.'
    expect(desc.length).toBeLessThan(280)
    const result = SkillFrontmatter.safeParse({
      ...baseValid,
      description: desc,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a description in the 280-512 warning band', () => {
    const desc = `Use when ${'x'.repeat(400)}`
    expect(desc.length).toBeGreaterThanOrEqual(280)
    expect(desc.length).toBeLessThanOrEqual(512)
    const result = SkillFrontmatter.safeParse({
      ...baseValid,
      description: desc,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a description at exactly 512 chars (boundary)', () => {
    const desc = 'U'.padEnd(512, 'x')
    expect(desc.length).toBe(512)
    const result = SkillFrontmatter.safeParse({
      ...baseValid,
      description: desc,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a description over 512 chars', () => {
    const desc = 'U'.padEnd(513, 'x')
    expect(desc.length).toBe(513)
    const result = SkillFrontmatter.safeParse({
      ...baseValid,
      description: desc,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a 600-char description (acceptance gate)', () => {
    const desc = 'U'.padEnd(600, 'x')
    const result = SkillFrontmatter.safeParse({
      ...baseValid,
      description: desc,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const tooBig = result.error.issues.find((i) => i.code === 'too_big')
      expect(tooBig).toBeDefined()
    }
  })

  it('rejects an empty description', () => {
    const result = SkillFrontmatter.safeParse({ ...baseValid, description: '' })
    expect(result.success).toBe(false)
  })
})

describe('Existing skill descriptions stay within budget ( audit)', () => {
  it('every shipped skills/**.md description is ≤512 chars', async () => {
    const matter = (await import('gray-matter')).default
    const out = execSync('find skills -type f -name "*.md"', {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
    const offenders: Array<{ path: string; len: number }> = []
    for (const f of out) {
      const raw = readFileSync(f, 'utf8')
      const { data } = matter(raw)
      if (
        typeof data.description === 'string' &&
        data.description.length > 512
      ) {
        offenders.push({ path: f, len: data.description.length })
      }
    }
    expect(offenders).toEqual([])
  })
})
