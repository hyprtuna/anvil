import { describe, expect, it } from 'vitest'
import { buildPrSuggestion } from '../../../../../src/core/release/build-pr-suggestion.js'
import type { SlateSections } from '../../../../../src/core/release/parse-slate-sections.js'

describe('buildPrSuggestion', () => {
  const sections: SlateSections = {
    added: '- ANV-0154: anvil release command',
    fixed: '- ANV-0157: scope detection fix',
  }

  it('produces a title with the release version', () => {
    const pr = buildPrSuggestion('0.13.3', '0.13.4', sections)
    expect(pr.title).toBe('chore(release): v0.13.4')
  })

  it('body contains the from → to version range', () => {
    const pr = buildPrSuggestion('0.13.3', '0.13.4', sections)
    expect(pr.body).toContain('0.13.3')
    expect(pr.body).toContain('0.13.4')
  })

  it('body contains content from the Added section', () => {
    const pr = buildPrSuggestion('0.13.3', '0.13.4', sections)
    expect(pr.body).toContain('ANV-0154')
  })

  it('body contains content from the Fixed section', () => {
    const pr = buildPrSuggestion('0.13.3', '0.13.4', sections)
    expect(pr.body).toContain('ANV-0157')
  })

  it('body does NOT include section headings for absent sections', () => {
    const pr = buildPrSuggestion('0.13.3', '0.13.4', sections)
    // No improved or deferred sections provided
    expect(pr.body).not.toContain('### Improved')
    expect(pr.body).not.toContain('### Deferred')
  })

  it('body includes git tag instructions', () => {
    const pr = buildPrSuggestion('0.13.3', '0.13.4', sections)
    expect(pr.body).toContain('git tag v0.13.4')
    expect(pr.body).toContain('git push origin v0.13.4')
  })

  it('produces a placeholder body when no sections are present', () => {
    const pr = buildPrSuggestion('1.0.0', '1.0.1', {})
    expect(pr.body).toContain('manually')
  })
})
