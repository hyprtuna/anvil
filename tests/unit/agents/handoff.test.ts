import { describe, expect, it } from 'vitest'
import {
  AgentHandoff,
  HandoffStatus,
  type HandoffStatus as HandoffStatusT,
} from '../../../src/core/types.js'

const BASE = {
  from: 'orchestrator',
  to: 'feature-development',
  role: 'worker' as const,
  task: {
    description: 'Implement login form validation',
    successCriteria: ['tests pass', 'lint green'],
    context: {
      files: ['src/auth/login.ts'],
      skills: ['test-driven-development'],
      rules: ['verification-before-completion'],
    },
  },
  artifacts: {
    required: [
      { name: 'patch', kind: 'file' as const, location: 'src/auth/login.ts' },
    ],
  },
  status: 'pending' as const,
}

describe('core/types — AgentHandoff valid round-trip', () => {
  const validCases: Array<{ label: string; input: Record<string, unknown> }> = [
    { label: 'minimum: pending status, no trace', input: BASE },
    {
      label: 'in_progress with trace.startedAt',
      input: {
        ...BASE,
        status: 'in_progress',
        trace: { startedAt: '2026-04-24T00:00:00Z' },
      },
    },
    {
      label: 'done with full trace',
      input: {
        ...BASE,
        status: 'done',
        trace: {
          startedAt: '2026-04-24T00:00:00Z',
          finishedAt: '2026-04-24T00:05:00Z',
          model: 'claude-opus-4-7',
        },
      },
    },
    {
      label: 'done_with_concerns with empty successCriteria',
      input: {
        ...BASE,
        task: { ...BASE.task, successCriteria: [] },
        status: 'done_with_concerns',
      },
    },
    {
      label: 'needs_context with empty files',
      input: {
        ...BASE,
        task: { ...BASE.task, context: { ...BASE.task.context, files: [] } },
        status: 'needs_context',
      },
    },
    {
      label: 'blocked with empty required artifacts',
      input: {
        ...BASE,
        artifacts: { required: [] },
        status: 'blocked',
      },
    },
    {
      label: 'verification role',
      input: { ...BASE, role: 'verification' },
    },
    {
      label: 'researcher role',
      input: { ...BASE, role: 'researcher' },
    },
    {
      label: 'orchestrator role',
      input: { ...BASE, role: 'orchestrator' },
    },
    {
      label: 'json artifact kind',
      input: {
        ...BASE,
        artifacts: {
          required: [{ name: 'summary', kind: 'json' as const }],
        },
      },
    },
  ]

  it('accepts all 10 canonical valid cases', () => {
    for (const { label, input } of validCases) {
      expect(() => AgentHandoff.parse(input), label).not.toThrow()
    }
  })
})

describe('core/types — AgentHandoff invalid round-trip', () => {
  const invalidCases: Array<{ label: string; input: Record<string, unknown> }> =
    [
      { label: 'missing from', input: { ...BASE, from: undefined } },
      { label: 'empty to', input: { ...BASE, to: '' } },
      {
        label: 'legacy role=specialist',
        input: { ...BASE, role: 'specialist' },
      },
      { label: 'unknown status', input: { ...BASE, status: 'mostly_done' } },
      {
        label: 'artifact.kind invalid',
        input: {
          ...BASE,
          artifacts: {
            required: [{ name: 'x', kind: 'binary' }],
          },
        },
      },
    ]

  it('rejects all 5 canonical invalid cases', () => {
    for (const { label, input } of invalidCases) {
      expect(() => AgentHandoff.parse(input), label).toThrow()
    }
  })
})

describe('core/types — HandoffStatus enum', () => {
  it('exposes all six status values', () => {
    const expected: HandoffStatusT[] = [
      'pending',
      'in_progress',
      'done',
      'done_with_concerns',
      'needs_context',
      'blocked',
    ]
    expect(HandoffStatus.options).toEqual(expected)
  })
})
