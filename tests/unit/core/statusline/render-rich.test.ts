/**
 * Unit tests for the rich (truecolor RGB-gradient) statusline renderer.
 * Plan 34 A8.
 *
 * All tests use the fake cwd `/tmp/no-git-here` to avoid real git calls.
 * The `_nowSec` parameter is injected to make time-sensitive tests deterministic.
 */

import { describe, expect, it } from 'vitest'
import { parseShortstat } from '../../../../src/commands/cli/statusline.js'
import { renderRich } from '../../../../src/core/statusline/render-rich.js'
import type { StatuslineInputT } from '../../../../src/core/statusline/schema.js'
import {
  formatResetTime,
  pctRgb,
} from '../../../../src/core/statusline/shared.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')
const normalizeTime = (s: string): string =>
  s.replace(/\(\d+[dhmsDHMS][0-9dhmsDHMS]*\)/g, '(<TIME>)')
const normalize = (s: string): string => normalizeTime(stripAnsi(s))

/** Base fixture — no git (fake cwd), no ctx, no rate limits. */
function baseInput(
  overrides: Partial<StatuslineInputT> = {},
): StatuslineInputT {
  return {
    cwd: '/tmp/no-git-here',
    session_id: 'test-session',
    model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet' },
    ...overrides,
  }
}

const NOW = 1_000_000 // arbitrary fixed epoch (seconds)

// ── pctRgb gradient ──────────────────────────────────────────────────────────

describe('shared.pctRgb gradient', () => {
  it('0% produces green(0,200,80) color', () => {
    const color = pctRgb(0)
    // t=0 from green(0,200,80) → green(0,200,80): RGB unchanged
    expect(color).toContain('38;2;0;200;80')
  })

  it('50% produces yellow(220,200,0) color', () => {
    const color = pctRgb(50)
    // t=1 from green→yellow: (0,200,80)+(220,200,0)*1 = (220,200,0)
    expect(color).toContain('38;2;220;200;0')
  })

  it('100% produces red(220,40,20) color', () => {
    const color = pctRgb(100)
    expect(color).toContain('38;2;220;40;20')
  })

  it('25% is between green and yellow', () => {
    const color = pctRgb(25)
    // t=0.5: r=0+(220*0.5)=110, g=200+(200-200)*0.5=200, b=80+(0-80)*0.5=40
    expect(color).toContain('38;2;110;200;40')
  })

  it('75% is between yellow and red', () => {
    const color = pctRgb(75)
    // t=0.5: r=220, g=200+(40-200)*0.5=120, b=0+(20-0)*0.5=10
    expect(color).toContain('38;2;220;120;10')
  })
})

// ── formatResetTime ───────────────────────────────────────────────────────────

describe('shared.formatResetTime', () => {
  it('returns "now" when epoch ≤ nowSec', () => {
    expect(formatResetTime(NOW, NOW)).toBe('now')
    expect(formatResetTime(NOW - 1, NOW)).toBe('now')
  })

  it('formats 5 minutes as "5m"', () => {
    expect(formatResetTime(NOW + 5 * 60, NOW)).toBe('5m')
  })

  it('formats 1 hour as "1h0m"', () => {
    expect(formatResetTime(NOW + 3600, NOW)).toBe('1h0m')
  })

  it('formats 2h30m correctly', () => {
    expect(formatResetTime(NOW + 2 * 3600 + 30 * 60, NOW)).toBe('2h30m')
  })

  it('formats 23h59m correctly', () => {
    expect(formatResetTime(NOW + 23 * 3600 + 59 * 60, NOW)).toBe('23h59m')
  })

  it('formats 2d3h correctly', () => {
    expect(formatResetTime(NOW + 2 * 86400 + 3 * 3600, NOW)).toBe('2d3h')
  })

  it('formats "now" for zero diff', () => {
    expect(formatResetTime(NOW, NOW)).toBe('now')
  })
})

// ── parseShortstat ────────────────────────────────────────────────────────────

describe('parseShortstat', () => {
  it('parses insertions and deletions', () => {
    const r = parseShortstat(
      ' 3 files changed, 42 insertions(+), 7 deletions(-)',
    )
    expect(r.added).toBe(42)
    expect(r.removed).toBe(7)
  })

  it('handles insertions only', () => {
    const r = parseShortstat(' 1 file changed, 10 insertions(+)')
    expect(r.added).toBe(10)
    expect(r.removed).toBe(0)
  })

  it('handles deletions only', () => {
    const r = parseShortstat(' 1 file changed, 5 deletions(-)')
    expect(r.added).toBe(0)
    expect(r.removed).toBe(5)
  })

  it('handles empty string', () => {
    const r = parseShortstat('')
    expect(r.added).toBe(0)
    expect(r.removed).toBe(0)
  })
})

// ── Context bar + emoji thresholds ───────────────────────────────────────────

describe('renderRich — context bar and emoji thresholds', () => {
  it('19% ctx → 🟢 emoji', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 19,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('🟢')
    expect(out).toContain('19%')
  })

  it('20% ctx → ⚡ emoji', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 20,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('⚡')
  })

  it('69% ctx → ⚡ emoji', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 69,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('⚡')
  })

  it('70% ctx → 🔥 emoji', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 70,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('🔥')
  })

  it('89% ctx → 🔥 emoji', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 89,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('🔥')
  })

  it('90% ctx → 🚨 emoji', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 90,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('🚨')
  })

  it('100% ctx → 🚨 emoji', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 100,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('🚨')
    expect(out).toContain('100%')
  })

  it('0% ctx → 🟢 and empty bar only', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('🟢')
    expect(out).toContain('0%')
    // No filled blocks — bar only has ░
    expect(out).toContain('░')
    expect(out).not.toContain('█')
  })

  it('50% ctx produces 10 filled blocks', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 50,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    // Strip ANSI; count filled blocks (█) = 10
    const out = stripAnsi(renderRich(input, {}, NOW))
    const filledCount = (out.match(/█/g) ?? []).length
    expect(filledCount).toBe(10)
  })

  it('100% ctx produces 20 filled blocks', () => {
    const input = baseInput({
      context_window: {
        used_percentage: 100,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    const filledCount = (out.match(/█/g) ?? []).length
    expect(filledCount).toBe(20)
  })
})

// ── Rate-limit windows ────────────────────────────────────────────────────────

describe('renderRich — rate-limit windows', () => {
  it('renders 7d window with percentage and reset time', () => {
    const input = baseInput({
      rate_limits: {
        seven_day: {
          used_percentage: 65,
          resets_at: NOW + 2 * 86400 + 3 * 3600,
        },
      },
    })
    const out = normalize(renderRich(input, {}, NOW))
    expect(out).toMatch(/7d:65%\(<TIME>\)/)
  })

  it('renders 5h window with percentage and reset time', () => {
    const input = baseInput({
      rate_limits: {
        five_hour: { used_percentage: 42, resets_at: NOW + 9000 },
      },
    })
    const out = normalize(renderRich(input, {}, NOW))
    expect(out).toMatch(/5h:42%\(<TIME>\)/)
  })

  it('renders both windows when present', () => {
    const input = baseInput({
      rate_limits: {
        seven_day: { used_percentage: 80, resets_at: NOW + 86400 },
        five_hour: { used_percentage: 30, resets_at: NOW + 3600 },
      },
    })
    const out = normalize(renderRich(input, {}, NOW))
    expect(out).toMatch(/7d:80%/)
    expect(out).toMatch(/5h:30%/)
  })

  it('clips percentage at 100', () => {
    const input = baseInput({
      rate_limits: {
        seven_day: { used_percentage: 150, resets_at: NOW + 3600 },
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('7d:100%')
  })
})

// ── Model + effort segment ────────────────────────────────────────────────────

describe('renderRich — model and effort segment (A3)', () => {
  it('shows model name always', () => {
    const input = baseInput()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('Sonnet')
  })

  it('shows effort alongside model when defined', () => {
    const input = baseInput({ output_style: { name: 'medium' } })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('Sonnet')
    expect(out).toContain('medium')
    // The · separator between model and effort
    expect(out).toContain('·')
  })

  it('shows effort even when effort is "default"', () => {
    const input = baseInput({ output_style: { name: 'default' } })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('default')
  })

  it('shows model without · when no effort defined', () => {
    const input = baseInput()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('·')
  })

  it('includes 🤖 emoji before model name', () => {
    const input = baseInput()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('🤖')
  })
})

// ── Branch display ────────────────────────────────────────────────────────────

describe('renderRich — branch display', () => {
  it('shows branch in parentheses with 🌿 when opts.branch provided', () => {
    const input = baseInput()
    const out = stripAnsi(renderRich(input, { branch: 'main' }, NOW))
    expect(out).toContain('🌿 (main)')
  })

  it('omits branch segment when no branch and no git', () => {
    const input = baseInput()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('🌿')
  })
})

// ── Separator style ───────────────────────────────────────────────────────────

describe('renderRich — separator style', () => {
  it('uses | as segment separator', () => {
    const input = baseInput({
      output_style: { name: 'high' },
      rate_limits: {
        five_hour: { used_percentage: 30, resets_at: NOW + 3600 },
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    // Should have pipe separators between segments
    expect(out).toContain('|')
  })
})

// ── Full render integration ───────────────────────────────────────────────────

describe('renderRich — full fixture smoke tests', () => {
  it('renders ctx + rate-limit + model in correct order', () => {
    const input = baseInput({
      output_style: { name: 'xhigh' },
      context_window: {
        used_percentage: 55,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
      rate_limits: {
        seven_day: { used_percentage: 80, resets_at: NOW + 86400 },
        five_hour: { used_percentage: 42, resets_at: NOW + 9000 },
      },
    })
    const out = normalize(renderRich(input, {}, NOW))
    // Order from bash reference: bar | 7d | 5h | model
    const barIdx = out.indexOf('55%')
    const weekIdx = out.indexOf('7d:')
    const fiveIdx = out.indexOf('5h:')
    const modelIdx = out.indexOf('Sonnet')
    expect(barIdx).toBeLessThan(weekIdx)
    expect(weekIdx).toBeLessThan(fiveIdx)
    expect(fiveIdx).toBeLessThan(modelIdx)
  })

  it('renders with branch injected via opts', () => {
    const input = baseInput({ output_style: { name: 'medium' } })
    const out = stripAnsi(renderRich(input, { branch: 'feature/test' }, NOW))
    expect(out).toContain('🌿 (feature/test)')
    expect(out).toContain('Sonnet')
    expect(out).toContain('medium')
  })
})
