import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../../../../', import.meta.url).pathname.replace(
  /\/$/,
  '',
)

/**
 * Plan 39 Phase E — manifest snapshot assertions for v0.10.2.
 *
 * These filesystem-level checks verify the shape of shipped files without
 * driving the CC manifest builder end-to-end (which requires a full install
 * run). The assertions match what the manifest builder would consume:
 *  - skills/universal/ui/rules.md exists and has correct frontmatter
 *  - comment-checker and ui-rules source files are gone
 *  - load-all.ts has no import from comment-checker.js or ui-rules.js
 */
describe('adapters/claude-code manifest snapshot (v0.10.2 Phase E)', () => {
  it('ui-anti-pattern-rules skill file exists', () => {
    const p = join(ROOT, 'skills/universal/ui/rules.md')
    expect(existsSync(p)).toBe(true)
  })

  it('ui-anti-pattern-rules frontmatter has correct name', async () => {
    const content = await readFile(
      join(ROOT, 'skills/universal/ui/rules.md'),
      'utf-8',
    )
    expect(content).toContain('name: ui-anti-pattern-rules')
  })

  it('ui-anti-pattern-rules is not user-invocable', async () => {
    const content = await readFile(
      join(ROOT, 'skills/universal/ui/rules.md'),
      'utf-8',
    )
    expect(content).toContain('user-invocable: false')
  })

  it('ui-anti-pattern-rules has kind: meta', async () => {
    const content = await readFile(
      join(ROOT, 'skills/universal/ui/rules.md'),
      'utf-8',
    )
    expect(content).toContain('kind: meta')
  })

  it('ui-anti-pattern-rules frontmatter has all 7 paths globs', async () => {
    const content = await readFile(
      join(ROOT, 'skills/universal/ui/rules.md'),
      'utf-8',
    )
    expect(content).toContain('**/*.tsx')
    expect(content).toContain('**/*.jsx')
    expect(content).toContain('**/*.vue')
    expect(content).toContain('**/*.html')
    expect(content).toContain('**/*.css')
    expect(content).toContain('**/*.scss')
    expect(content).toContain('**/*.svelte')
  })

  it('ui-anti-pattern-rules body contains all 15 rule headings', async () => {
    const content = await readFile(
      join(ROOT, 'skills/universal/ui/rules.md'),
      'utf-8',
    )
    const expectedRules = [
      'hardcoded-color',
      'inter-only-font',
      'missing-reduced-motion',
      'low-contrast-text',
      'missing-alt-text',
      'inline-style',
      'magic-number-spacing',
      'missing-focus-indicator',
      'deep-nesting',
      'important-overuse',
      'fixed-width-container',
      'missing-label',
      'z-index-war',
      'non-semantic-div',
      'no-skip-nav',
    ]
    for (const rule of expectedRules) {
      expect(content).toContain(rule)
    }
  })

  it('comment-checker handler source does NOT exist', () => {
    const p = join(ROOT, 'src/hooks/handlers/comment-checker.ts')
    expect(existsSync(p)).toBe(false)
  })

  it('ui-rules handler source does NOT exist', () => {
    const p = join(ROOT, 'src/hooks/handlers/ui-rules.ts')
    expect(existsSync(p)).toBe(false)
  })

  it('load-all.ts does not import from comment-checker.js', async () => {
    const content = await readFile(join(ROOT, 'src/hooks/load-all.ts'), 'utf-8')
    expect(content).not.toContain('comment-checker.js')
  })

  it('load-all.ts does not import from ui-rules.js', async () => {
    const content = await readFile(join(ROOT, 'src/hooks/load-all.ts'), 'utf-8')
    expect(content).not.toContain('ui-rules.js')
  })

  it('post-edit.ts does not import from ui-rules.js', async () => {
    const content = await readFile(
      join(ROOT, 'src/hooks/handlers/post-edit.ts'),
      'utf-8',
    )
    expect(content).not.toContain('ui-rules.js')
  })

  it('post-edit.ts does not reference checkUiAntiPatterns', async () => {
    const content = await readFile(
      join(ROOT, 'src/hooks/handlers/post-edit.ts'),
      'utf-8',
    )
    expect(content).not.toContain('checkUiAntiPatterns')
  })
})
