import { describe, expect, it } from 'vitest'
import {
  render,
  renderDefault,
  renderMaximal,
  renderMinimal,
} from '../../../../src/core/statusline/render.js'
import type { StatuslineInputT } from '../../../../src/core/statusline/schema.js'

const baseInput: StatuslineInputT = {
  cwd: '/tmp/x',
  session_id: 'test',
  model: { id: 'claude-opus-4-7', display_name: 'Opus' },
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripper needs the literal ESC byte.
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

describe('core/statusline/render — minimal tier', () => {
  it('renders model name only when no tokens recorded', () => {
    const out = stripAnsi(renderMinimal(baseInput))
    expect(out).toBe('Opus')
  })

  it('appends formatted token total when context_window has totals', () => {
    const out = stripAnsi(
      renderMinimal({
        ...baseInput,
        context_window: {
          total_input_tokens: 850,
          total_output_tokens: 200,
        },
      }),
    )
    expect(out).toBe('Opus | tok:1.1k')
  })
})

describe('core/statusline/render — default tier', () => {
  it('renders model + effort + tokens + branch when present', () => {
    const out = stripAnsi(
      renderDefault(
        {
          ...baseInput,
          output_style: { name: 'xhigh' },
          context_window: {
            total_input_tokens: 1500,
            total_output_tokens: 250,
          },
        },
        { branch: 'main' },
      ),
    )
    expect(out).toBe('Opus | xhigh | tok:1.8k | main')
  })

  it('shows effort even when output_style.name is "default" (Plan 34 A3)', () => {
    // A3: effort segment always shown when defined, even when name === 'default'
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        output_style: { name: 'default' },
      }),
    )
    expect(out).toBe('Opus | default')
  })

  it('omits rate_limits block when absent (free-tier user)', () => {
    const out = stripAnsi(
      renderDefault(
        { ...baseInput, output_style: { name: 'high' } },
        { branch: 'feat' },
      ),
    )
    expect(out).toBe('Opus | high | feat')
    expect(out).not.toMatch(/5h:/)
  })

  it('renders 5h rate-limit window when present (Pro/Max)', () => {
    const future = Math.floor(Date.now() / 1000) + 3600 * 2 + 60 * 30
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        rate_limits: {
          five_hour: { used_percentage: 42, resets_at: future },
        },
      }),
    )
    expect(out).toMatch(/5h:42%\(2h30m\)/)
  })

  it('renders ctx: segment when context_window.used_percentage is present', () => {
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        context_window: {
          total_input_tokens: 1000,
          total_output_tokens: 200,
          used_percentage: 67,
        },
      }),
    )
    expect(out).toMatch(/ctx:67%/)
  })

  it('omits ctx: segment when context_window.used_percentage is absent', () => {
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        context_window: {
          total_input_tokens: 1000,
          total_output_tokens: 200,
          // used_percentage intentionally omitted
        },
      }),
    )
    expect(out).not.toMatch(/ctx:/)
  })

  it('omits ctx: segment when context_window is absent entirely', () => {
    const out = stripAnsi(renderDefault(baseInput))
    expect(out).not.toMatch(/ctx:/)
  })

  it('renders 7d: segment when rate_limits.seven_day is present', () => {
    const future7d = Math.floor(Date.now() / 1000) + 86400 * 3 + 3600 * 6
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        rate_limits: {
          seven_day: { used_percentage: 42, resets_at: future7d },
        },
      }),
    )
    expect(out).toMatch(/7d:42%\(3d6h\)/)
  })

  it('omits 7d: segment when rate_limits.seven_day is absent', () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        rate_limits: {
          five_hour: { used_percentage: 10, resets_at: future },
          // seven_day intentionally omitted
        },
      }),
    )
    expect(out).toMatch(/5h:/)
    expect(out).not.toMatch(/7d:/)
  })

  it('omits 7d: segment when rate_limits is absent entirely (free-tier)', () => {
    const out = stripAnsi(renderDefault(baseInput))
    expect(out).not.toMatch(/7d:/)
  })

  it('does not render cost in default tier', () => {
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        cost: { total_cost_usd: 1.5 },
      }),
    )
    expect(out).not.toMatch(/\$/)
  })

  it('renders ctx + 5h + 7d together in correct order', () => {
    const future5h = Math.floor(Date.now() / 1000) + 3600
    const future7d = Math.floor(Date.now() / 1000) + 86400 * 2
    const out = stripAnsi(
      renderDefault({
        ...baseInput,
        context_window: { used_percentage: 55 },
        rate_limits: {
          five_hour: { used_percentage: 30, resets_at: future5h },
          seven_day: { used_percentage: 75, resets_at: future7d },
        },
      }),
    )
    const ctxIdx = out.indexOf('ctx:')
    const fiveHIdx = out.indexOf('5h:')
    const sevenDIdx = out.indexOf('7d:')
    expect(ctxIdx).toBeGreaterThan(-1)
    expect(fiveHIdx).toBeGreaterThan(-1)
    expect(sevenDIdx).toBeGreaterThan(-1)
    // Order: ctx → 5h → 7d
    expect(ctxIdx).toBeLessThan(fiveHIdx)
    expect(fiveHIdx).toBeLessThan(sevenDIdx)
  })
})

describe('core/statusline/render — maximal tier', () => {
  it('renders ctx, cost, 5h, 7d, branch+dirty, agent name', () => {
    const future5h = Math.floor(Date.now() / 1000) + 3600
    const future7d = Math.floor(Date.now() / 1000) + 86400 * 3
    const out = stripAnsi(
      renderMaximal(
        {
          ...baseInput,
          model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet' },
          output_style: { name: 'high' },
          context_window: {
            total_input_tokens: 5000,
            total_output_tokens: 1000,
            used_percentage: 87,
          },
          cost: { total_cost_usd: 1.234 },
          rate_limits: {
            five_hour: { used_percentage: 23, resets_at: future5h },
            seven_day: { used_percentage: 60, resets_at: future7d },
          },
          agent: { name: 'code-reviewer' },
        },
        { branch: 'main', dirty: true },
      ),
    )
    expect(out).toMatch(
      /^Sonnet \| high \| tok:6\.0k \| ctx:87% \| \$1\.23 \| 5h:23%\(1h0m\)/,
    )
    expect(out).toMatch(/7d:60%/)
    expect(out).toMatch(/main ●/)
    expect(out).toMatch(/@code-reviewer/)
  })

  it('Pro/Max-absent fixture: no rate_limits, no current_usage (free-tier)', () => {
    const out = stripAnsi(
      renderMaximal({
        ...baseInput,
        cost: { total_cost_usd: 0.05 },
      }),
    )
    expect(out).toBe('Opus | $0.05')
    expect(out).not.toMatch(/5h:/)
    expect(out).not.toMatch(/7d:/)
    expect(out).not.toMatch(/ctx:/)
  })
})

describe('core/statusline/render — tier dispatch', () => {
  it('dispatches via render(tier, ...) with simple template', () => {
    // Plan 34 A4: render() defaults to 'rich'. Pass template:'simple' to test tier-based dispatch.
    expect(
      stripAnsi(render('minimal', baseInput, { template: 'simple' })),
    ).toBe('Opus')
    expect(
      stripAnsi(render('default', baseInput, { template: 'simple' })),
    ).toBe('Opus')
    expect(
      stripAnsi(render('maximal', baseInput, { template: 'simple' })),
    ).toBe('Opus')
  })

  it('dispatches to rich renderer by default (Plan 34 A4)', () => {
    // Default template = 'rich'; output contains 🤖 model emoji
    const out = stripAnsi(render('default', baseInput))
    expect(out).toContain('🤖')
    expect(out).toContain('Opus')
  })
})

describe('core/statusline/render — performance', () => {
  it('default-tier render completes in under 30ms (1000 iterations)', () => {
    const start = Date.now()
    for (let i = 0; i < 1000; i++) {
      renderDefault(
        {
          ...baseInput,
          context_window: {
            total_input_tokens: 1000,
            total_output_tokens: 200,
          },
          rate_limits: {
            five_hour: {
              used_percentage: 50,
              resets_at: Date.now() / 1000 + 1000,
            },
          },
        },
        { branch: 'main' },
      )
    }
    const elapsed = Date.now() - start
    // 1000 iterations / 30ms cap → 30µs per render budget. Generous.
    expect(elapsed).toBeLessThan(30)
  })
})
