/**
 * Unit tests for ANV-0060 cross-contamination guard wiring in applyTargets.
 *
 * These tests mock the adapter modules to simulate overlapping ownedPathPrefixes
 * and verify that applyTargets refuses to proceed on contaminated targets.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock wire functions so disk writes never happen.
vi.mock('../../../src/installer/wire-claude-code.js', () => ({
  wireClaudeCodeUser: vi.fn(async () => ({ mode: 'filesystem', actions: [] })),
  wireClaudeCodeProject: vi.fn(async () => ({
    mode: 'filesystem',
    actions: [],
  })),
  unwireClaudeCodeUser: vi.fn(async () => ({
    mode: 'filesystem',
    actions: [],
  })),
  unwireClaudeCodeProject: vi.fn(async () => ({
    mode: 'filesystem',
    actions: [],
  })),
}))

vi.mock('../../../src/installer/wire-opencode.js', () => ({
  wireOpenCodeUser: vi.fn(async () => ({ mode: 'filesystem', actions: [] })),
  wireOpenCodeProject: vi.fn(async () => ({ mode: 'filesystem', actions: [] })),
  unwireOpenCodeUser: vi.fn(async () => ({ mode: 'filesystem', actions: [] })),
  unwireOpenCodeProject: vi.fn(async () => ({
    mode: 'filesystem',
    actions: [],
  })),
}))

import { applyTargets } from '../../../src/installer/wire.js'

const FAKE_OPTS = {
  anvilHome: '/fake/anvil-home',
  projectRoot: '/fake/project',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applyTargets — cross-contamination guard', () => {
  it('allows clean targets with disjoint adapter prefixes', async () => {
    // Real adapters have disjoint prefixes; both targets should succeed.
    const result = await applyTargets(['cc-user', 'oc-user'], FAKE_OPTS)
    expect(result['cc-user']).toBeDefined()
    expect(result['oc-user']).toBeDefined()
  })

  it('throws when adapter prefixes overlap and allowCrossTarget is false', async () => {
    // Inject mock adapters whose prefixes overlap (same prefix on both).
    // We mock the claude-code adapter module to simulate a misconfigured adapter
    // that claims it owns '.opencode/' — which OC also owns.
    const { claudeCodeAdapter } = await import(
      '../../../src/adapters/claude-code/adapter.js'
    )
    const overlapping = ['.opencode/'] // overlaps with opencodeAdapter's prefix
    const originalPrefixes = claudeCodeAdapter.ownedPathPrefixes
    // Temporarily mutate to simulate contamination.
    ;(claudeCodeAdapter as { ownedPathPrefixes: string[] }).ownedPathPrefixes =
      overlapping

    try {
      await expect(applyTargets(['cc-user'], FAKE_OPTS)).rejects.toThrow(
        /cross-contamination/i,
      )
    } finally {
      // Restore original prefixes.
      ;(
        claudeCodeAdapter as { ownedPathPrefixes: string[] }
      ).ownedPathPrefixes = originalPrefixes
    }
  })

  it('bypasses the guard and allows write when allowCrossTarget is true', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../src/adapters/claude-code/adapter.js'
    )
    const overlapping = ['.opencode/']
    const originalPrefixes = claudeCodeAdapter.ownedPathPrefixes
    ;(claudeCodeAdapter as { ownedPathPrefixes: string[] }).ownedPathPrefixes =
      overlapping

    try {
      // Should NOT throw with allowCrossTarget.
      const result = await applyTargets(['cc-user'], {
        ...FAKE_OPTS,
        allowCrossTarget: true,
      })
      expect(result['cc-user']).toBeDefined()
    } finally {
      ;(
        claudeCodeAdapter as { ownedPathPrefixes: string[] }
      ).ownedPathPrefixes = originalPrefixes
    }
  })
})
