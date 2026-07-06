import { describe, expect, it } from 'vitest'
import {
  type AgentInvocation,
  INVOCATION_STATUSES,
  type InvocationExecutor,
  parseInvocationStatus,
  prepareInvocation,
  runInvocation,
} from '../../../src/agents/runner.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { AgentRegistry } from '../../../src/core/registry/agent-registry.js'
import type { Agent } from '../../../src/core/types.js'

function makeAgent(name: string): Agent {
  return {
    frontmatter: {
      name,
      group: 'planning',
      description: name,
      trigger: [],
      preferred_model: 'claude-opus-4-6',
      preferred_effort: 'high',
      inputs: [],
      outputs: [],
      tools: ['Read'],
      chains: [],
      language: 'universal',
      tags: [],
      aliases: [],
      isHidden: false,
      max_turns: 20,
      tier: 2,
    },
    body: `# ${name}`,
    sourcePath: `/agents/${name}.md`,
  }
}

function makeInvocation(): AgentInvocation {
  const reg = new AgentRegistry()
  reg.register(makeAgent('ultra-worker'))
  return prepareInvocation(
    reg,
    buildDefaultConfig(),
    'ultra-worker',
    'do the thing',
  )
}

describe('agents/runner — status protocol', () => {
  it('INVOCATION_STATUSES lists exactly the four canonical terminal states', () => {
    expect(INVOCATION_STATUSES).toEqual([
      'done',
      'done_with_concerns',
      'needs_context',
      'blocked',
    ])
  })

  describe('parseInvocationStatus', () => {
    for (const status of INVOCATION_STATUSES) {
      it(`parses terminal status "${status}"`, () => {
        const out = `work happens\n{"status":"${status}"}\n`
        const { status: parsed } = parseInvocationStatus(out)
        expect(parsed).toBe(status)
      })
    }

    it('defaults to done_with_concerns when no status line is present', () => {
      const { status } = parseInvocationStatus(
        'agent wrote some prose and stopped',
      )
      expect(status).toBe('done_with_concerns')
    })

    it('ignores non-matching status values (never silently "done")', () => {
      const { status } = parseInvocationStatus('finished\n{"status":"ok"}\n')
      expect(status).toBe('done_with_concerns')
    })

    it('uses the LAST status line when multiple appear', () => {
      const out = '{"status":"needs_context"}\nmore work\n{"status":"done"}\n'
      const { status } = parseInvocationStatus(out)
      expect(status).toBe('done')
    })

    it('captures the raw status line for observability', () => {
      const { statusLine } = parseInvocationStatus(
        'body\n{"status":"blocked","reason":"missing creds"}',
      )
      expect(statusLine).toContain('blocked')
      expect(statusLine).toContain('missing creds')
    })
  })

  describe('runInvocation', () => {
    it('dispatches via the executor and returns a structured result', async () => {
      const executor: InvocationExecutor = async () =>
        'built the feature\n{"status":"done"}\n'
      const result = await runInvocation(makeInvocation(), executor)
      expect(result.status).toBe('done')
      expect(result.output).toContain('built the feature')
      expect(result.artifacts).toEqual([])
    })

    it('returns done_with_concerns for unparseable output', async () => {
      const executor: InvocationExecutor = async () => 'no explicit marker'
      const result = await runInvocation(makeInvocation(), executor)
      expect(result.status).toBe('done_with_concerns')
    })

    it('propagates executor rejection', async () => {
      const executor: InvocationExecutor = async () => {
        throw new Error('SDK timeout')
      }
      await expect(runInvocation(makeInvocation(), executor)).rejects.toThrow(
        /SDK timeout/,
      )
    })
  })
})
