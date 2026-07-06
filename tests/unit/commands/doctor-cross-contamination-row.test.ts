/**
 * Unit tests for ANV-0060 — pushCrossContaminationCheck doctor row.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { claudeCodeAdapter } from '../../../src/adapters/claude-code/adapter.js'
import { opencodeAdapter } from '../../../src/adapters/opencode/adapter.js'
import { pushCrossContaminationCheck } from '../../../src/commands/cli/doctor.js'

afterEach(() => {
  // Restore adapter prefixes to originals after each test that mutates them.
  ;(claudeCodeAdapter as { ownedPathPrefixes: string[] }).ownedPathPrefixes = [
    '.claude-plugin/',
    '.claude/',
  ]
  ;(opencodeAdapter as { ownedPathPrefixes: string[] }).ownedPathPrefixes = [
    '.opencode/',
    'plugins/opencode/',
  ]
})

describe('pushCrossContaminationCheck', () => {
  it('emits pass when real adapters have disjoint prefixes', () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushCrossContaminationCheck(checks)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Adapter cross-contamination guard')
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('disjoint')
  })

  it('emits warn when claude-code adapter claims a prefix owned by opencode', () => {
    // Simulate a misconfigured adapter whose prefixes overlap with opencode.
    ;(claudeCodeAdapter as { ownedPathPrefixes: string[] }).ownedPathPrefixes =
      [
        '.claude-plugin/',
        '.opencode/', // overlaps with opencodeAdapter
      ]
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushCrossContaminationCheck(checks)
    const warnRow = checks.find((c) => c.status === 'warn')
    expect(warnRow).toBeDefined()
    expect(warnRow?.name).toBe('Adapter cross-contamination guard')
    expect(warnRow?.detail).toMatch(/cross-contamination/i)
  })

  it('emits warn when opencode adapter claims a prefix owned by claude-code', () => {
    ;(opencodeAdapter as { ownedPathPrefixes: string[] }).ownedPathPrefixes = [
      '.opencode/',
      '.claude-plugin/', // overlaps with claudeCodeAdapter
    ]
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushCrossContaminationCheck(checks)
    const warnRow = checks.find((c) => c.status === 'warn')
    expect(warnRow).toBeDefined()
    expect(warnRow?.detail).toMatch(/cross-contamination/i)
  })
})
