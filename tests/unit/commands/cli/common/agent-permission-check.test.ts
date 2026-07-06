/**
 * ANV-0003 — Unit tests for the pure agent permission coverage helper.
 */

import { describe, expect, it } from 'vitest'
import {
  computeAgentPermissionCoverage,
  computeEffectiveTools,
} from '../../../../../src/commands/cli/common/agent-permission-check.js'

describe('computeEffectiveTools()', () => {
  it('returns the input tools unchanged when no deny list is provided', () => {
    const r = computeEffectiveTools(['Read', 'Edit'], undefined)
    expect(r).toEqual(['Read', 'Edit'])
  })

  it('returns the input tools unchanged when the deny list is empty', () => {
    const r = computeEffectiveTools(['Read', 'Edit'], [])
    expect(r).toEqual(['Read', 'Edit'])
  })

  it('removes denied tools while preserving order', () => {
    const r = computeEffectiveTools(['Read', 'Edit', 'Bash', 'Glob'], ['Edit'])
    expect(r).toEqual(['Read', 'Bash', 'Glob'])
  })

  it('removes every denied tool', () => {
    const r = computeEffectiveTools(['Read', 'Edit', 'Bash'], ['Edit', 'Bash'])
    expect(r).toEqual(['Read'])
  })
})

describe('computeAgentPermissionCoverage()', () => {
  it('emits skip status when no agents are provided', () => {
    const r = computeAgentPermissionCoverage([])
    expect(r.status).toBe('skip')
    expect(r.total).toBe(0)
  })

  it('emits skip status when no agents classify', () => {
    const r = computeAgentPermissionCoverage([
      { name: 'researcher', tools: ['Read'] },
      { name: 'mystery-thing', tools: ['Read'] },
    ])
    expect(r.status).toBe('skip')
    expect(r.unclassified).toEqual(['researcher', 'mystery-thing'])
    expect(r.total).toBe(0)
  })

  it('passes a clean read-only reviewer', () => {
    const r = computeAgentPermissionCoverage([
      {
        name: 'code-reviewer',
        tools: ['Read', 'Glob', 'Grep'],
      },
    ])
    expect(r.status).toBe('pass')
    expect(r.clean).toBe(1)
    expect(r.violations).toHaveLength(0)
  })

  it('passes a clean write-capable worker', () => {
    const r = computeAgentPermissionCoverage([
      {
        name: 'ultra-worker',
        tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
      },
    ])
    expect(r.status).toBe('pass')
    expect(r.clean).toBe(1)
    expect(r.violations).toHaveLength(0)
  })

  it('flags a reviewer carrying Edit', () => {
    const r = computeAgentPermissionCoverage([
      {
        name: 'bad-reviewer',
        tools: ['Read', 'Edit', 'Glob'],
      },
    ])
    expect(r.status).toBe('warn')
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.name).toBe('bad-reviewer')
    expect(r.violations[0]?.class).toBe('reviewer')
    expect(r.violations[0]?.unexpectedTools).toEqual(['Edit'])
  })

  it('flags a reviewer carrying Bash', () => {
    const r = computeAgentPermissionCoverage([
      {
        name: 'code-reviewer',
        tools: ['Read', 'Bash', 'Glob', 'Grep'],
      },
    ])
    expect(r.status).toBe('warn')
    expect(r.violations[0]?.unexpectedTools).toEqual(['Bash'])
  })

  it('respects disallowedTools — a denied Edit does not violate', () => {
    const r = computeAgentPermissionCoverage([
      {
        name: 'careful-reviewer',
        tools: ['Read', 'Edit', 'Glob'],
        disallowedTools: ['Edit'],
      },
    ])
    expect(r.status).toBe('pass')
    expect(r.violations).toHaveLength(0)
  })

  it('lists multiple forbidden tools per violation', () => {
    const r = computeAgentPermissionCoverage([
      {
        name: 'noisy-analyzer',
        tools: ['Read', 'Edit', 'Bash', 'Glob'],
      },
    ])
    expect(r.violations[0]?.unexpectedTools).toEqual(['Edit', 'Bash'])
  })

  it('separates clean from violating agents in a mixed batch', () => {
    const r = computeAgentPermissionCoverage([
      { name: 'code-reviewer', tools: ['Read', 'Glob'] },
      { name: 'bad-validator', tools: ['Read', 'Edit'] },
      { name: 'ultra-worker', tools: ['Read', 'Edit', 'Bash'] },
      { name: 'mystery', tools: ['Read'] }, // unclassified
    ])
    expect(r.total).toBe(3) // mystery is unclassified
    expect(r.clean).toBe(2) // reviewer + worker
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.name).toBe('bad-validator')
    expect(r.unclassified).toEqual(['mystery'])
    expect(r.status).toBe('warn')
  })

  it('write-capable classes are never flagged regardless of declared tools', () => {
    const r = computeAgentPermissionCoverage([
      { name: 'code-architect', tools: ['Read'] },
      { name: 'mcp-builder', tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'] },
      { name: 'orchestrator', tools: ['Read'] },
    ])
    expect(r.status).toBe('pass')
    expect(r.violations).toHaveLength(0)
  })
})
