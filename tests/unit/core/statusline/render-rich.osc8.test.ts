/**
 * OSC 8 hyperlink tests for the rich statusline renderer — Plan 45 Phase C1.
 *
 * Tests are TDD-style (RED until renderer is updated).
 * Per D-08: links opt-in via statusline.links:true AND TERM_PROGRAM allowlist.
 * Apple Terminal is explicitly excluded.
 */

import { describe, expect, it } from 'vitest'
import { renderRich } from '../../../../src/core/statusline/render-rich.js'
import type { StatuslineInputT } from '../../../../src/core/statusline/schema.js'
import { link, sanitiseOsc8 } from '../../../../src/core/statusline/shared.js'

/** Base fixture — minimal fields, no git. */
function base(overrides: Partial<StatuslineInputT> = {}): StatuslineInputT {
  return {
    cwd: '/tmp/no-git-here',
    session_id: 'test-session',
    model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet' },
    ...overrides,
  }
}

const NOW = 1_000_000

// ── sanitiseOsc8() unit tests ─────────────────────────────────────────────────

describe('sanitiseOsc8()', () => {
  it('returns unchanged label and URL-encoded url for plain ASCII', () => {
    const result = sanitiseOsc8('code-architect', 'https://example.com/path')
    expect(result).not.toBeNull()
    expect(result?.label).toBe('code-architect')
    expect(result?.url).toBe('https://example.com/path')
  })

  it('returns null when label is empty after sanitisation', () => {
    // A label consisting only of control chars → stripped to empty → null
    expect(sanitiseOsc8('\x1b\x07', 'https://example.com')).toBeNull()
  })

  it('returns null when url is empty after sanitisation', () => {
    expect(sanitiseOsc8('hello', '\x1b\x07')).toBeNull()
  })

  it('returns null when label contains only ESC (stripped to empty)', () => {
    // Only ESC character in the label → stripped to empty → null
    expect(sanitiseOsc8('\x1b', 'https://example.com')).toBeNull()
  })

  it('strips ESC from label containing \\x1b]8;; — non-control chars survive', () => {
    // ESC is stripped; ']8;;' is plain ASCII and survives.
    // The real protection is that the URL built from a malicious name goes through
    // encodeURIComponent in render-rich.ts before reaching sanitiseOsc8.
    const result = sanitiseOsc8('\x1b]8;;', 'https://example.com')
    expect(result).not.toBeNull()
    expect(result?.label).toBe(']8;;')
    // ESC is gone from the label
    expect(result?.label).not.toContain('\x1b')
  })

  it('strips ESC and BEL from label — pure control sequence becomes empty → null', () => {
    // Attack name using only C0 controls (all stripped)
    const maliciousName = '\x1b\x07\x00\x01\x1f'
    expect(sanitiseOsc8(maliciousName, 'https://safe.example.com')).toBeNull()
  })

  it('strips BEL (\\x07) from URL — url with \\x07 is rejected when that makes it empty', () => {
    // URL that is only a BEL char → rejected
    expect(sanitiseOsc8('label', '\x07')).toBeNull()
  })

  it('strips \\x07 from a URL that has other content, does not reject it entirely', () => {
    // URL with embedded BEL survives sanitisation (BEL stripped, rest remains)
    const result = sanitiseOsc8('label', 'https://example.com/\x07path')
    expect(result).not.toBeNull()
    expect(result?.url).not.toContain('\x07')
    expect(result?.url).toContain('example.com')
  })

  it('strips all C0 control characters from label', () => {
    const result = sanitiseOsc8('foo\x00\x01\x1ebar', 'https://example.com')
    expect(result).not.toBeNull()
    expect(result?.label).toBe('foobar')
  })

  it('URL-encodes spaces in URL', () => {
    const result = sanitiseOsc8('label', 'https://example.com/path with spaces')
    expect(result).not.toBeNull()
    expect(result?.url).toBe('https://example.com/path%20with%20spaces')
  })

  it('preserves valid URL characters unchanged', () => {
    const url = 'https://github.com/search?q=code-architect&type=repos'
    const result = sanitiseOsc8('label', url)
    expect(result).not.toBeNull()
    expect(result?.url).toBe(url)
  })
})

// ── link() helper unit tests ──────────────────────────────────────────────────

describe('shared.link() helper', () => {
  it('returns raw text when enabled=false', () => {
    expect(link('hello', 'https://example.com', false, 'iTerm.app')).toBe(
      'hello',
    )
  })

  it('returns raw text when termProgram is undefined', () => {
    expect(link('hello', 'https://example.com', true, undefined)).toBe('hello')
  })

  it('returns raw text for Apple_Terminal even when enabled=true', () => {
    expect(link('hello', 'https://example.com', true, 'Apple_Terminal')).toBe(
      'hello',
    )
  })

  it('returns raw text for unknown terminal when enabled=true', () => {
    expect(link('hello', 'https://example.com', true, 'xterm-256color')).toBe(
      'hello',
    )
  })

  it('wraps in OSC 8 for iTerm.app when enabled=true', () => {
    const result = link('hello', 'https://example.com', true, 'iTerm.app')
    expect(result).toContain('\x1b]8;;https://example.com\x1b\\')
    expect(result).toContain('hello')
    expect(result).toContain('\x1b]8;;\x1b\\')
  })

  it('wraps in OSC 8 for WezTerm when enabled=true', () => {
    const result = link('hello', 'https://example.com', true, 'WezTerm')
    expect(result).toContain('\x1b]8;;')
    expect(result).toContain('hello')
  })

  it('wraps in OSC 8 for kitty when enabled=true', () => {
    const result = link('hello', 'https://example.com', true, 'kitty')
    expect(result).toContain('\x1b]8;;')
    expect(result).toContain('hello')
  })

  it('wraps in OSC 8 for ghostty when enabled=true', () => {
    const result = link('hello', 'https://example.com', true, 'ghostty')
    expect(result).toContain('\x1b]8;;')
    expect(result).toContain('hello')
  })

  it('produces correct OSC 8 full sequence format', () => {
    const ESC = '\x1b'
    const expected = `${ESC}]8;;https://example.com${ESC}\\hello${ESC}]8;;${ESC}\\`
    expect(link('hello', 'https://example.com', true, 'iTerm.app')).toBe(
      expected,
    )
  })
})

// ── renderRich OSC 8 integration via RenderOptions ───────────────────────────

describe('renderRich — OSC 8 links via RenderOptions', () => {
  it('with links:true and iTerm.app — agent name wraps in OSC 8 escape', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = renderRich(
      input,
      { links: true, termProgram: 'iTerm.app' },
      NOW,
    )
    // OSC 8 escape sequence present
    expect(out).toContain('\x1b]8;;')
  })

  it('with links:true and Apple_Terminal — no OSC 8 escapes', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = renderRich(
      input,
      { links: true, termProgram: 'Apple_Terminal' },
      NOW,
    )
    expect(out).not.toContain('\x1b]8;;')
  })

  it('with links:false regardless of TERM_PROGRAM — no OSC 8 escapes', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = renderRich(
      input,
      { links: false, termProgram: 'iTerm.app' },
      NOW,
    )
    expect(out).not.toContain('\x1b]8;;')
  })

  it('with no termProgram supplied — no OSC 8 escapes', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = renderRich(input, { links: true }, NOW)
    expect(out).not.toContain('\x1b]8;;')
  })

  it('without links option at all — no OSC 8 escapes (default off)', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = renderRich(input, {}, NOW)
    expect(out).not.toContain('\x1b]8;;')
  })
})

// ── link() sanitisation tests ─────────────────────────────────────────────────

describe('shared.link() — sanitisation of attack inputs', () => {
  it('returns raw text when url contains only control chars (stripped to empty)', () => {
    // ESC+BEL URL stripped to empty → fallback to raw text
    const result = link('hello', '\x1b\x07', true, 'iTerm.app')
    expect(result).toBe('hello')
    expect(result).not.toContain('\x1b]8;;')
  })

  it('strips BEL from url when url has other content — no BEL in emitted sequence', () => {
    // URL with embedded BEL: BEL stripped, rest emitted
    const result = link(
      'hello',
      'https://example.com/\x07path',
      true,
      'iTerm.app',
    )
    expect(result).toContain('\x1b]8;;')
    expect(result).not.toContain('\x07')
  })

  it('plain ASCII label and url — wraps correctly in OSC 8', () => {
    const ESC = '\x1b'
    const result = link('hello', 'https://example.com', true, 'iTerm.app')
    expect(result).toBe(
      `${ESC}]8;;https://example.com${ESC}\\hello${ESC}]8;;${ESC}\\`,
    )
  })

  it('url with ESC is sanitised — no raw ESC in emitted URL field', () => {
    // URL has ESC embedded: stripped before emission
    const result = link(
      'label',
      'https://example.com/\x1bpath',
      true,
      'iTerm.app',
    )
    // The result must not contain the raw ESC in the URL portion
    // (it will contain ESC as part of OSC 8 protocol sequences, but not in the URL itself)
    expect(result).toContain('\x1b]8;;https://example.com/path')
  })
})

// ── renderRich — injection attack via agent.name ──────────────────────────────

describe('renderRich — agent.name injection attack inputs', () => {
  it('agent name of only control chars — segment is skipped entirely (sanitiseOsc8 null)', () => {
    // A name that is entirely control chars → sanitiseOsc8 returns null → no segment at all
    const allControls = '\x1b\x07\x00\x01\x1f'
    const input = base({ agent: { name: allControls } })
    const out = renderRich(
      input,
      { links: true, termProgram: 'iTerm.app' },
      NOW,
    )
    // No @ prefix should appear (segment was skipped)
    expect(out).not.toContain('@')
    expect(out).not.toContain('\x1b]8;;')
  })

  it('agent name with embedded ESC — no raw ESC injecting evil URL as OSC 8 hyperlink', () => {
    // Name after stripping ESC/BEL has non-control content; sanitiseOsc8 returns non-null.
    // The display label has ESC stripped (so ']8;;...' is just display text, not a hyperlink).
    // The actual hyperlink URL is a safe github search URL (not evil.example.com).
    const maliciousName = '\x1b]8;;https://evil.example.com\x07'
    const input = base({ agent: { name: maliciousName } })
    const out = renderRich(
      input,
      { links: true, termProgram: 'iTerm.app' },
      NOW,
    )
    // The evil URL must NOT appear as an OSC 8 hyperlink target (ESC]8;;evil...)
    // This is the key: no raw ESC before ]8;;https://evil
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching ESC for security assertion
    expect(out).not.toMatch(/\x1b\]8;;https:\/\/evil\.example\.com/)
  })

  it('agent name with embedded BEL — BEL does not appear in output', () => {
    // name has a BEL embedded; it must be stripped from display and URL
    const trickyName = 'code\x07-architect'
    const input = base({ agent: { name: trickyName } })
    const out = renderRich(
      input,
      { links: true, termProgram: 'iTerm.app' },
      NOW,
    )
    // BEL must not appear anywhere in output (not in display, not in URL)
    expect(out).not.toContain('\x07')
  })

  it('clean agent name still produces OSC 8 link when links enabled', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = renderRich(input, { links: true, termProgram: 'kitty' }, NOW)
    expect(out).toContain('\x1b]8;;')
  })
})
