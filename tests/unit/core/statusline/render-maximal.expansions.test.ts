/**
 * Expansion tests for the maximal (simple) statusline renderer — Plan 45 Phase C1.
 *
 * Parallel coverage to render-rich.expansions.test.ts for the fields that
 * apply to renderMaximal.
 */

import { describe, expect, it } from 'vitest'
import { renderMaximal } from '../../../../src/core/statusline/render.js'
import type { StatuslineInputT } from '../../../../src/core/statusline/schema.js'

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

/** Base fixture — minimal fields. */
function base(overrides: Partial<StatuslineInputT> = {}): StatuslineInputT {
  return {
    cwd: '/tmp/no-git-here',
    session_id: 'test-session',
    model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet' },
    ...overrides,
  }
}

// ── vim.mode ──────────────────────────────────────────────────────────────────

describe('renderMaximal expansion — vim.mode', () => {
  it('shows NORMAL mode when vim.mode is NORMAL', () => {
    const input = base({ vim: { mode: 'NORMAL' } })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('NORMAL')
  })

  it('shows INSERT mode when vim.mode is INSERT', () => {
    const input = base({ vim: { mode: 'INSERT' } })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('INSERT')
  })

  it('omits vim segment when absent', () => {
    const input = base()
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('NORMAL')
    expect(out).not.toContain('INSERT')
  })
})

// ── worktree annotation ──────────────────────────────────────────────────────

describe('renderMaximal expansion — worktree annotation', () => {
  it('shows worktree name when branch differs from original_branch', () => {
    const input = base({
      worktree: {
        name: 'my-feature',
        path: '/some/path',
        branch: 'feat/new',
        original_branch: 'main',
      },
    })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('my-feature')
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
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('🌳')
    expect(out).not.toContain('same-branch')
  })

  it('omits worktree annotation when worktree is absent', () => {
    const input = base()
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('🌳')
  })
})

// ── agent.name (already in maximal — verify preserved) ───────────────────────

describe('renderMaximal expansion — agent.name (already present)', () => {
  it('shows agent name when agent is present', () => {
    const input = base({ agent: { name: 'code-architect' } })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('code-architect')
  })

  it('omits agent segment when agent is absent', () => {
    const input = base()
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('@')
  })
})

// ── cache_read_input_tokens ───────────────────────────────────────────────────

describe('renderMaximal expansion — cache_read_input_tokens', () => {
  it('shows cached segment when >= 1000', () => {
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
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('cached:3k')
  })

  it('omits cached segment when < 1000', () => {
    const input = base({
      context_window: {
        total_input_tokens: 500,
        total_output_tokens: 0,
        current_usage: {
          input_tokens: 500,
          output_tokens: 0,
          cache_read_input_tokens: 500,
        },
      },
    })
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('cached:')
  })
})

// ── cost.total_duration_ms ────────────────────────────────────────────────────

describe('renderMaximal expansion — cost.total_duration_ms', () => {
  it('shows duration in minutes when >= 60_000ms', () => {
    const input = base({
      cost: { total_duration_ms: 120_000 },
    })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('2m')
  })

  it('omits duration when < 60_000ms', () => {
    const input = base({
      cost: { total_duration_ms: 30_000 },
    })
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toMatch(/\b\d+m\b/)
  })
})

// ── session_name ──────────────────────────────────────────────────────────────

describe('renderMaximal expansion — session_name', () => {
  it('shows session name when present', () => {
    const input = base({ session_name: 'my-session' })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('my-session')
  })

  it('omits session name when absent', () => {
    const input = base()
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('my-session')
  })
})

// ── output_style (D-09 — visible string preserved) ───────────────────────────

describe('renderMaximal expansion — output_style (D-09)', () => {
  it('renders effort string identically', () => {
    const input = base({ output_style: { name: 'high' } })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('high')
  })
})

// ── exceeds_200k_tokens ───────────────────────────────────────────────────────

describe('renderMaximal expansion — exceeds_200k_tokens', () => {
  it('shows !200K when exceeds_200k_tokens is true', () => {
    const input = base({ exceeds_200k_tokens: true })
    const out = stripAnsi(renderMaximal(input))
    expect(out).toContain('!200K')
  })

  it('omits !200K when exceeds_200k_tokens is false', () => {
    const input = base({ exceeds_200k_tokens: false })
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('!200K')
  })

  it('omits !200K when absent', () => {
    const input = base()
    const out = stripAnsi(renderMaximal(input))
    expect(out).not.toContain('!200K')
  })
})
