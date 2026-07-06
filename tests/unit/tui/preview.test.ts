import { describe, expect, it } from 'vitest'
import { renderPreview } from '../../../src/tui/screens/preview.js'

describe('tui/preview', () => {
  it('lists every file that will be written, grouped by adapter', () => {
    const out = renderPreview({
      adapters: [
        {
          name: 'claude-code',
          files: [
            { path: '.claude-plugin/plugin.json' },
            { path: 'skills/debugging.md' },
          ],
        },
        { name: 'opencode', files: [{ path: '.opencode/agents.json' }] },
      ],
    })
    expect(out).toContain('claude-code')
    expect(out).toContain('.claude-plugin/plugin.json')
    expect(out).toContain('skills/debugging.md')
    expect(out).toContain('opencode')
    expect(out).toContain('.opencode/agents.json')
  })

  it('shows file count summary', () => {
    const out = renderPreview({
      adapters: [
        {
          name: 'claude-code',
          files: Array.from({ length: 42 }, (_, i) => ({
            path: `skills/s${i}.md`,
          })),
        },
      ],
    })
    expect(out).toMatch(/42 file/)
  })
})
