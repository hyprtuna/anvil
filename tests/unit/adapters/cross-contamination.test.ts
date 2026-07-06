/**
 * Unit tests for the cross-contamination guard (ANV-0060).
 */
import { describe, expect, it } from 'vitest'
import {
  checkCrossContamination,
  formatCrossContaminationError,
} from '../../../src/adapters/cross-contamination.js'
import type { PlatformAdapter } from '../../../src/adapters/interface.js'

// ---------------------------------------------------------------------------
// Minimal adapter stubs — only the fields the guard cares about.
// ---------------------------------------------------------------------------

function makeAdapter(
  name: 'claude-code' | 'opencode',
  ownedPathPrefixes: string[],
): PlatformAdapter {
  return {
    name,
    schemaVersion: 1,
    ownedPathPrefixes,
    detect: async () => false,
    generate: async () => ({
      adapterName: name,
      installRoot: '',
      files: [],
    }),
    verify: async () => ({ ok: true, findings: [] }),
  }
}

const cc = makeAdapter('claude-code', ['.claude-plugin/', '.claude/'])
const oc = makeAdapter('opencode', ['.opencode/', 'plugins/opencode/'])
const allAdapters = [cc, oc]

// ---------------------------------------------------------------------------
// checkCrossContamination
// ---------------------------------------------------------------------------

describe('checkCrossContamination — clean paths', () => {
  it('allows claude-code to write into its own prefixes', () => {
    const result = checkCrossContamination(
      cc,
      ['.claude-plugin/plugin.json', '.claude/settings.json'],
      allAdapters,
    )
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('allows opencode to write into its own prefixes', () => {
    const result = checkCrossContamination(
      oc,
      ['.opencode/opencode.json', 'plugins/opencode/package.json'],
      allAdapters,
    )
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('allows writes to neutral paths (not owned by any adapter)', () => {
    const result = checkCrossContamination(
      cc,
      ['.anvil/manifest.json', 'skills/my-skill.md'],
      allAdapters,
    )
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})

describe('checkCrossContamination — violations', () => {
  it('refuses opencode writing into .claude-plugin/ (owned by claude-code)', () => {
    const result = checkCrossContamination(
      oc,
      ['.claude-plugin/plugin.json'],
      allAdapters,
    )
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].writingAdapter).toBe('opencode')
    expect(result.violations[0].ownerAdapter).toBe('claude-code')
    expect(result.violations[0].matchedPrefix).toBe('.claude-plugin/')
    expect(result.violations[0].path).toBe('.claude-plugin/plugin.json')
  })

  it('refuses claude-code writing into .opencode/ (owned by opencode)', () => {
    const result = checkCrossContamination(
      cc,
      ['.opencode/opencode.json'],
      allAdapters,
    )
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].writingAdapter).toBe('claude-code')
    expect(result.violations[0].ownerAdapter).toBe('opencode')
    expect(result.violations[0].matchedPrefix).toBe('.opencode/')
  })

  it('collects multiple violations from one call', () => {
    const result = checkCrossContamination(
      oc,
      ['.claude-plugin/plugin.json', '.claude/settings.json'],
      allAdapters,
    )
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(2)
  })

  it('violation message names both adapters', () => {
    const result = checkCrossContamination(
      oc,
      ['.claude-plugin/plugin.json'],
      allAdapters,
    )
    const msg = formatCrossContaminationError(result.violations)
    expect(msg).toContain('opencode')
    expect(msg).toContain('claude-code')
    expect(msg).toContain('--allow-cross-target')
  })
})

describe('checkCrossContamination — --allow-cross-target override', () => {
  it('returns ok when allowCrossTarget is true, even for contaminating paths', () => {
    const result = checkCrossContamination(
      oc,
      ['.claude-plugin/plugin.json'],
      allAdapters,
      { allowCrossTarget: true },
    )
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})

describe('checkCrossContamination — path normalisation', () => {
  it('normalises leading ./ before prefix matching', () => {
    const result = checkCrossContamination(
      oc,
      ['./.claude-plugin/plugin.json'],
      allAdapters,
    )
    expect(result.ok).toBe(false)
    expect(result.violations[0].matchedPrefix).toBe('.claude-plugin/')
  })
})

// ---------------------------------------------------------------------------
// formatCrossContaminationError
// ---------------------------------------------------------------------------

describe('formatCrossContaminationError', () => {
  it('returns empty string for empty violations array', () => {
    expect(formatCrossContaminationError([])).toBe('')
  })

  it('includes path detail in the output', () => {
    const result = checkCrossContamination(
      oc,
      ['.claude-plugin/plugin.json'],
      allAdapters,
    )
    const msg = formatCrossContaminationError(result.violations)
    expect(msg).toContain('.claude-plugin/plugin.json')
    expect(msg).toContain("prefix '.claude-plugin/'")
  })
})

// ---------------------------------------------------------------------------
// Real adapter ownedPathPrefixes
// ---------------------------------------------------------------------------

describe('real adapters expose ownedPathPrefixes', () => {
  it('claudeCodeAdapter has ownedPathPrefixes', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../src/adapters/claude-code/adapter.js'
    )
    expect(Array.isArray(claudeCodeAdapter.ownedPathPrefixes)).toBe(true)
    expect(claudeCodeAdapter.ownedPathPrefixes.length).toBeGreaterThan(0)
    expect(
      claudeCodeAdapter.ownedPathPrefixes.some((p) =>
        p.includes('.claude-plugin'),
      ),
    ).toBe(true)
  })

  it('opencodeAdapter has ownedPathPrefixes', async () => {
    const { opencodeAdapter } = await import(
      '../../../src/adapters/opencode/adapter.js'
    )
    expect(Array.isArray(opencodeAdapter.ownedPathPrefixes)).toBe(true)
    expect(opencodeAdapter.ownedPathPrefixes.length).toBeGreaterThan(0)
    expect(
      opencodeAdapter.ownedPathPrefixes.some((p) => p.includes('.opencode')),
    ).toBe(true)
  })

  it('real guard: opencode refused from .claude-plugin/ without flag', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../src/adapters/claude-code/adapter.js'
    )
    const { opencodeAdapter } = await import(
      '../../../src/adapters/opencode/adapter.js'
    )
    const result = checkCrossContamination(
      opencodeAdapter,
      ['.claude-plugin/plugin.json'],
      [claudeCodeAdapter, opencodeAdapter],
    )
    expect(result.ok).toBe(false)
    expect(result.violations[0].ownerAdapter).toBe('claude-code')
    expect(result.violations[0].writingAdapter).toBe('opencode')
  })
})
