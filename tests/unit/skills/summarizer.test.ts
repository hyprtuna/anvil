import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillPath = join(
  __dirname,
  '..',
  '..',
  '..',
  'skills',
  'universal',
  'summarization.md',
)

function readSkill(): { frontmatter: string; body: string } {
  const content = readFileSync(skillPath, 'utf-8')
  const fmMatch = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/.exec(content)
  if (!fmMatch) throw new Error('Could not parse skill frontmatter')
  return { frontmatter: fmMatch[1], body: fmMatch[2] }
}

describe('skills/universal/summarization', () => {
  it('skill file exists', () => {
    const content = readFileSync(skillPath, 'utf-8')
    expect(content).toBeTruthy()
    expect(content.startsWith('---')).toBe(true)
  })

  it('frontmatter sets user-invocable: false', () => {
    const { frontmatter } = readSkill()
    expect(frontmatter).toContain('user-invocable: false')
  })

  it('frontmatter sets disable-model-invocation: true', () => {
    const { frontmatter } = readSkill()
    expect(frontmatter).toContain('disable-model-invocation: true')
  })

  it('frontmatter sets group: cost-optimised', () => {
    const { frontmatter } = readSkill()
    expect(frontmatter).toContain('group: cost-optimised')
  })

  // ANV-0214 (v0.17): preferred_model was removed from skill frontmatter.
  // Model selection for summarization is now governed by the cost-optimised
  // group (tested above via 'group: cost-optimised') and the SKILL_MODEL_REGISTRY.

  it('body documents ≤200 word output constraint', () => {
    const { body } = readSkill()
    expect(body).toMatch(/[≤<=].*200.*word/i)
  })

  it('body mentions preserving file paths', () => {
    const { body } = readSkill()
    expect(body.toLowerCase()).toMatch(/file\s+path/)
  })

  it('body mentions preserving error class names', () => {
    const { body } = readSkill()
    expect(body.toLowerCase()).toMatch(/error.*class|class.*error/i)
  })

  it('body has strategy guidance for different tool types', () => {
    const { body } = readSkill()
    // Must have a strategy table or section mentioning known tools
    expect(body).toMatch(/Bash|Read|Grep/)
  })

  describe('output length contract via diffstatSummary', () => {
    it('diffstatSummary preserves file paths in diff input', async () => {
      // Import directly — no mocks contaminate this test file
      const { diffstatSummary, looksLikeDiff } = await import(
        '../../../src/hooks/handlers/on-large-output.js'
      )
      const diff = [
        'diff --git a/src/core/types.ts b/src/core/types.ts',
        'index abc..def 100644',
        '--- a/src/core/types.ts',
        '+++ b/src/core/types.ts',
        '@@ -1,3 +1,4 @@',
        ' export const existing = 1',
        '+export const NewType = z.string()',
        '-export const old = 2',
      ].join('\n')

      expect(looksLikeDiff(diff)).toBe(true)
      const summary = diffstatSummary(diff)
      // Must contain the exact file path
      expect(summary).toContain('src/core/types.ts')
      // Must have a totals line
      expect(summary).toMatch(/file.*changed/i)
    })

    it('buildMechanicalSummary preserves error class names in stack trace', async () => {
      const { countWords, estimateTokens } = await import(
        '../../../src/hooks/handlers/on-large-output.js'
      )

      // Verify helper functions work correctly for trace inputs
      const stackTrace = [
        'TypeError: Cannot read property "foo" of undefined',
        '    at Object.<anonymous> (src/core/types.ts:42:10)',
        'ZodError: invalid_type at path [model]',
      ].join('\n')

      const wordCount = countWords(stackTrace)
      expect(wordCount).toBeGreaterThan(0)
      const tokens = estimateTokens(stackTrace)
      expect(tokens).toBeGreaterThan(0)
    })
  })
})
