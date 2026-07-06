import { describe, expect, it } from 'vitest'
import {
  findSafeCut,
  truncateMarkdown,
} from '../../../../src/core/context/markdown-truncate.js'

describe('truncateMarkdown', () => {
  it('returns unchanged content when within budget', () => {
    const content = '# Hello\n\nSome content here.'
    const result = truncateMarkdown(content, 1000)
    expect(result.truncated).toBe(false)
    expect(result.text).toBe(content)
  })

  it('truncates body when over budget', () => {
    const content = `# Hello\n\n${'x'.repeat(200)}`
    const result = truncateMarkdown(content, 50)
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThan(content.length)
  })

  it('preserves frontmatter block on truncation', () => {
    const content = `---\ntitle: My Spec\nstatus: draft\n---\n# Section\n\n${'y'.repeat(500)}`
    const result = truncateMarkdown(content, 100)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('---\ntitle: My Spec\nstatus: draft\n---')
  })

  it('preserves headings in skeleton when they are cut off', () => {
    const content =
      '# Introduction\n\nLorem ipsum dolor sit amet.\n\n## Deep Section\n\nMore content.\n\n### Subsection\n\nEven more content.'
    // Use a budget large enough to fit the notice + skeleton but still trigger truncation
    const result = truncateMarkdown(content, 100)
    expect(result.truncated).toBe(true)
    // The missing headings should appear in the skeleton
    expect(result.text).toContain('## Deep Section')
    expect(result.text.length).toBeLessThanOrEqual(100)
  })

  it('preserves unchecked checklist items when cut off', () => {
    const content = `# Tasks\n\n- [x] Done task\n- [ ] Pending task 1\n- [ ] Pending task 2\n\n${'x'.repeat(500)}`
    // Use a budget large enough to fit the notice + skeleton
    const result = truncateMarkdown(content, 150)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('- [ ] Pending task')
    expect(result.text.length).toBeLessThanOrEqual(150)
  })

  it('preserves checked checklist items when cut off', () => {
    const content = `# Tasks\n\n- [x] Completed task\n\n${'x'.repeat(500)}`
    // Use a budget large enough to fit the notice + skeleton
    const result = truncateMarkdown(content, 150)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('- [x] Completed task')
    expect(result.text.length).toBeLessThanOrEqual(150)
  })

  it('handles content with no frontmatter', () => {
    const content = '# No Frontmatter\n\nBody content here.\n'
    const result = truncateMarkdown(content, 1000)
    expect(result.truncated).toBe(false)
    expect(result.text).toBe(content)
  })

  it('handles empty content', () => {
    const result = truncateMarkdown('', 100)
    expect(result.truncated).toBe(false)
    expect(result.text).toBe('')
  })

  it('includes truncation notice on truncation', () => {
    const content = 'x'.repeat(1000)
    const result = truncateMarkdown(content, 100)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('[truncated')
  })

  it('handles frontmatter with no closing delimiter gracefully', () => {
    const content = '---\ntitle: broken\n# Heading\n\nBody.'
    const result = truncateMarkdown(content, 1000)
    expect(result.truncated).toBe(false)
    expect(result.text).toBe(content)
  })

  it('never cuts inside a fenced code block', () => {
    const content = `# Heading\n\nIntro paragraph.\n\n\`\`\`ts\nconst veryLongInsideFence = "${'x'.repeat(300)}"\n\`\`\`\n\nTrailing.\n`
    // Pick a budget that would otherwise cut inside the fence.
    const result = truncateMarkdown(content, 200)
    expect(result.truncated).toBe(true)
    // Count fence markers in the output — must be even (zero open fences).
    const fenceCount = (result.text.match(/```/g) ?? []).length
    expect(fenceCount % 2).toBe(0)
  })

  it('prefers a section boundary near the cut', () => {
    const content =
      '# Intro\n\nIntro body line one.\nIntro body line two.\n\n## Section Two\n\nSection two body line one.\nSection two body line two.\n\n## Section Three\n\nSection three body.\n'
    const result = truncateMarkdown(content, 80)
    expect(result.truncated).toBe(true)
    // Should not end on a partial line.
    expect(result.text.length).toBeLessThanOrEqual(80)
  })

  describe('findSafeCut', () => {
    it('returns the full length when limit >= length', () => {
      const text = 'abc\n'
      expect(findSafeCut(text, 100)).toBe(text.length)
    })

    it('walks back to a newline at or before limit', () => {
      const text = 'line one\nline two\nline three\n'
      const cut = findSafeCut(text, 15)
      expect(text.slice(0, cut).endsWith('\n')).toBe(true)
    })

    it('does not cut inside a fenced code block', () => {
      const text =
        'pre\n```ts\nconst a = 1\nconst b = 2\nconst c = 3\n```\npost\n'
      // Limit lands mid-fence.
      const cut = findSafeCut(text, 30)
      const kept = text.slice(0, cut)
      const fenceCount = (kept.match(/```/g) ?? []).length
      expect(fenceCount % 2).toBe(0)
    })
  })

  it('result.text.length never exceeds maxChars even with tiny budget and large frontmatter', () => {
    // frontmatter is ~200 chars, maxChars is 50 — forces budget overflow scenario
    const fm = `---\nx: ${'a'.repeat(180)}\n---\n`
    const content = `${fm}# Heading\n\n${'body '.repeat(50)}`
    const result = truncateMarkdown(content, 50)
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(50)
  })
})
