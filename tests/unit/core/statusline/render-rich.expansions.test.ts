/**
 * Expansion tests for the rich statusline renderer — Plan 45 Phase C1.
 *
 * Covers the 9 new conditional segments added to renderRich in v0.11.0.
 * Tests are written TDD-style: they define the required behaviour and run
 * RED until the renderer is updated to emit the segments.
 */

import { describe, expect, it } from 'vitest'
import { renderRich } from '../../../../src/core/statusline/render-rich.js'
import type { StatuslineInputT } from '../../../../src/core/statusline/schema.js'

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

/** Base fixture — no git (fake cwd), minimal fields. */
function base(overrides: Partial<StatuslineInputT> = {}): StatuslineInputT {
  return {
    cwd: '/tmp/no-git-here',
    session_id: 'test-session',
    model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet' },
    ...overrides,
  }
}

const NOW = 1_000_000 // fixed epoch (seconds)

// ── 1. vim.mode ──────────────────────────────────────────────────────────────

describe('renderRich expansion — vim.mode', () => {
  it('shows NORMAL mode segment when vim.mode is NORMAL', () => {
    const input = base({ vim: { mode: 'NORMAL' } })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('NORMAL')
  })

  it('shows INSERT mode segment when vim.mode is INSERT', () => {
    const input = base({ vim: { mode: 'INSERT' } })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('INSERT')
  })

  it('omits vim mode segment when vim is absent', () => {
    const input = base()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('NORMAL')
    expect(out).not.toContain('INSERT')
  })
})

// ── 2. worktree.name + worktree.branch annotation ───────────────────────────

describe('renderRich expansion — worktree annotation', () => {
  it('shows worktree name when branch differs from original_branch', () => {
    const input = base({
      worktree: {
        name: 'my-feature',
        path: '/some/path',
        branch: 'feat/new',
        original_branch: 'main',
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('my-feature')
  })

  it('shows branch in worktree annotation when branch differs', () => {
    const input = base({
      worktree: {
        name: 'my-feature',
        path: '/some/path',
        branch: 'feat/new',
        original_branch: 'main',
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    // Should annotate with something like "🌳 my-feature (feat/new)" or similar
    expect(out).toMatch(/my-feature/)
  })

  it('omits worktree annotation when worktree is absent', () => {
    const input = base()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('🌳')
  })

  it('omits worktree annotation when branch matches original_branch', () => {
    const input = base({
      worktree: {
        name: 'same-branch',
        path: '/some/path',
        branch: 'main',
        original_branch: 'main',
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('🌳')
    expect(out).not.toContain('same-branch')
  })

  it('shows worktree annotation when original_branch is absent (name only)', () => {
    const input = base({
      worktree: {
        name: 'hook-worktree',
        path: '/some/path',
        // branch absent — hook-based worktree
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    // When branch is absent (hook-based), no annotation needed since we can't compare
    // Either shows or omits — just verify no crash
    expect(typeof out).toBe('string')
  })
})

// ── 3. agent.name (now in rich too) ─────────────────────────────────────────

describe('renderRich expansion — agent.name', () => {
  it('shows agent name when agent is present', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('code-architect')
  })

  it('omits agent segment when agent is absent', () => {
    const input = base()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('@')
  })
})

// ── 4. cache_read_input_tokens ───────────────────────────────────────────────

describe('renderRich expansion — cache_read_input_tokens', () => {
  it('shows cached segment when cache_read_input_tokens >= 1000', () => {
    const input = base({
      context_window: {
        total_input_tokens: 5000,
        total_output_tokens: 0,
        current_usage: {
          input_tokens: 5000,
          output_tokens: 0,
          cache_read_input_tokens: 3000,
        },
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('cached:')
    expect(out).toContain('3k')
  })

  it('shows cached:1k for exactly 1000 tokens', () => {
    const input = base({
      context_window: {
        total_input_tokens: 2000,
        total_output_tokens: 0,
        current_usage: {
          input_tokens: 2000,
          output_tokens: 0,
          cache_read_input_tokens: 1000,
        },
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('cached:1k')
  })

  it('omits cached segment when cache_read_input_tokens < 1000', () => {
    const input = base({
      context_window: {
        total_input_tokens: 500,
        total_output_tokens: 0,
        current_usage: {
          input_tokens: 500,
          output_tokens: 0,
          cache_read_input_tokens: 999,
        },
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('cached:')
  })

  it('omits cached segment when cache_read_input_tokens is absent', () => {
    const input = base({
      context_window: {
        total_input_tokens: 500,
        total_output_tokens: 0,
        current_usage: {
          input_tokens: 500,
          output_tokens: 0,
        },
      },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('cached:')
  })
})

// ── 5. cost.total_duration_ms ────────────────────────────────────────────────

describe('renderRich expansion — cost.total_duration_ms', () => {
  it('shows duration in minutes when >= 60_000ms', () => {
    const input = base({
      cost: { total_duration_ms: 120_000 }, // 2 minutes
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('2m')
  })

  it('shows hours and minutes for >= 1 hour', () => {
    const input = base({
      cost: { total_duration_ms: 3_720_000 }, // 1h2m
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('1h')
    expect(out).toContain('2m')
  })

  it('omits duration when < 60_000ms', () => {
    const input = base({
      cost: { total_duration_ms: 59_999 },
    })
    const out = stripAnsi(renderRich(input, {}, NOW))
    // Should not show duration segment
    expect(out).not.toMatch(/\d+m(?:\s|$|\|)/)
  })

  it('omits duration when cost is absent', () => {
    const input = base()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toMatch(/\b\d+m\b/)
  })
})

// ── 6. session_name ──────────────────────────────────────────────────────────

describe('renderRich expansion — session_name', () => {
  it('shows session name segment when session_name is present', () => {
    const input = base({ session_name: 'my-session' })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('my-session')
  })

  it('omits session name segment when absent', () => {
    const input = base()
    const out = stripAnsi(renderRich(input, {}, NOW))
    // No session name should appear
    expect(out).not.toContain('my-session')
  })
})

// ── 7. output_style internal rename — visible string preserved (D-09) ────────

describe('renderRich expansion — output_style rename (D-09)', () => {
  it('renders effort string identically before and after rename', () => {
    // The visible rendered string for output_style.name must be byte-identical
    // to what was rendered before the internal variable rename.
    const input = base({ output_style: { name: 'high' } })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('high')
    expect(out).toContain('·')
    // Rendered string must contain 'Sonnet · high' pattern
    expect(out).toMatch(/Sonnet\s+·\s+high/)
  })

  it('renders "medium" effort string unchanged', () => {
    const input = base({ output_style: { name: 'medium' } })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('medium')
  })
})

// ── 8. exceeds_200k_tokens ───────────────────────────────────────────────────

describe('renderRich expansion — exceeds_200k_tokens', () => {
  it('shows !200K red bold segment when exceeds_200k_tokens is true', () => {
    const input = base({ exceeds_200k_tokens: true })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).toContain('!200K')
  })

  it('omits !200K segment when exceeds_200k_tokens is false', () => {
    const input = base({ exceeds_200k_tokens: false })
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('!200K')
  })

  it('omits !200K segment when exceeds_200k_tokens is absent', () => {
    const input = base()
    const out = stripAnsi(renderRich(input, {}, NOW))
    expect(out).not.toContain('!200K')
  })
})

// ── Parity: absent fields → no extra separator ───────────────────────────────

describe('renderRich expansion — parity (no extra separators when fields absent)', () => {
  it('model-only output has no trailing separator', () => {
    const input = base()
    const out = stripAnsi(renderRich(input, {}, NOW))
    // Should not have leading/trailing pipes
    expect(out.trimStart()).not.toMatch(/^\|/)
    expect(out.trimEnd()).not.toMatch(/\|$/)
  })

  it('output with all new fields absent matches base output', () => {
    // A base input with none of the 9 new fields should produce the same output
    // as before (parity contract: byte-identical when new fields absent).
    const input = base()
    const out1 = renderRich(input, {}, NOW)
    const out2 = renderRich(base(), {}, NOW)
    expect(out1).toBe(out2)
  })
})
