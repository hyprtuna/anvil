import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  agentMarker,
  dispatchAgent,
  unknownMarker,
} from '../../../src/opencode-plugin/agents/dispatch.js'
import { parseLeadingMention } from '../../../src/opencode-plugin/agents/mention.js'
import type { ParsedAgent } from '../../../src/opencode-plugin/agents/schema.js'

// ─── parseLeadingMention tests ────────────────────────────────────────────────

describe('parseLeadingMention', () => {
  it('parses a leading mention with slug and rest', () => {
    const result = parseLeadingMention('@anvil:code-reviewer review src/foo.ts')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('code-reviewer')
    expect(result!.rest).toBe('review src/foo.ts')
  })

  it('tolerates leading whitespace (spec §3)', () => {
    const result = parseLeadingMention('   @anvil:plan-verifier check this')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('plan-verifier')
    expect(result!.rest).toBe('check this')
  })

  it('does NOT dispatch mid-message mention', () => {
    const result = parseLeadingMention(
      'please ask @anvil:code-reviewer to look',
    )
    expect(result).toBeNull()
  })

  it('does NOT dispatch empty slug (@anvil: hello)', () => {
    const result = parseLeadingMention('@anvil: hello')
    expect(result).toBeNull()
  })

  it('is case-sensitive — uppercase slug does NOT dispatch', () => {
    const result = parseLeadingMention('@anvil:CODE-REVIEWER hi')
    expect(result).toBeNull()
  })

  it('requires whitespace after slug', () => {
    // @anvil:foo with no trailing text should not match (rest is required)
    const result = parseLeadingMention('@anvil:code-reviewer')
    expect(result).toBeNull()
  })

  it('handles multi-line rest content', () => {
    const result = parseLeadingMention(
      '@anvil:plan-verifier\ncheck this\nand this',
    )
    // Multi-line: slug is plan-verifier, rest is the rest
    // Note: the regex requires \s+ after slug, which matches \n
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('plan-verifier')
  })
})

// ─── dispatchAgent tests ──────────────────────────────────────────────────────

function makeAgent(slug: string, body = 'Agent body.'): ParsedAgent {
  return {
    slug,
    systemBody: body,
    description: `Agent ${slug}`,
    tools: ['Read'],
  }
}

function makeAgents(...slugs: string[]): Map<string, ParsedAgent> {
  return new Map(slugs.map((s) => [s, makeAgent(s)]))
}

describe('dispatchAgent', () => {
  let tmpLogsDir: string

  beforeEach(async () => {
    tmpLogsDir = join(
      tmpdir(),
      `anvil-dispatch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(tmpLogsDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpLogsDir, { recursive: true, force: true })
  })

  it('dispatches a leading-mention (happy path)', async () => {
    const agents = makeAgents('code-reviewer')
    const messages = [
      { role: 'user', content: '@anvil:code-reviewer review src/foo.ts' },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain(agentMarker('code-reviewer'))
    expect(result[0].content).toContain(
      'You are now operating as the @anvil:code-reviewer agent',
    )
    expect(result[0].content).toContain('Agent body.')
    expect(result[1].role).toBe('user')
    expect(result[1].content).toBe('review src/foo.ts')
  })

  it('does NOT dispatch a mid-message mention', async () => {
    const agents = makeAgents('code-reviewer')
    const messages = [
      { role: 'user', content: 'please ask @anvil:code-reviewer to look' },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('please ask @anvil:code-reviewer to look')
  })

  it('emits warning system message for unknown slug', async () => {
    const agents = makeAgents('code-reviewer')
    const messages = [{ role: 'user', content: '@anvil:nonsense hello world' }]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain(unknownMarker('nonsense'))
    expect(result[0].content).toContain('Unknown Anvil agent `nonsense`')
    // User message is left intact (not stripped)
    expect(result[1].content).toBe('@anvil:nonsense hello world')
  })

  it('empty agent set treats any @anvil:* mention as unknown (D-10)', async () => {
    const agents = new Map<string, ParsedAgent>()
    const messages = [{ role: 'user', content: '@anvil:any-agent hello' }]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain('Unknown Anvil agent')
  })

  it('marker-guarded idempotency on replay (D-05)', async () => {
    const agents = makeAgents('code-reviewer')
    // Simulate a replayed message array that already has the marker
    const marker = agentMarker('code-reviewer')
    const messages = [
      {
        role: 'system',
        content: `${marker}\nYou are now operating as the @anvil:code-reviewer agent.\n\nAgent body.`,
      },
      { role: 'user', content: '@anvil:code-reviewer review src/foo.ts' },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    // Should return unchanged — already has the marker
    expect(result).toEqual(messages)
  })

  it('dispatches when routing system message precedes user message', async () => {
    // Simulates the real pipeline where routing directive is already prepended.
    const agents = makeAgents('code-reviewer')
    const messages = [
      {
        role: 'system',
        content: '<!-- anvil-routing -->\nRoute through Anvil.',
      },
      { role: 'user', content: '@anvil:code-reviewer review this' },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    // Should dispatch: routing-system → agent-persona-system → user
    expect(result).toHaveLength(3)
    expect(result[0].content).toContain('<!-- anvil-routing -->')
    expect(result[1].content).toContain(agentMarker('code-reviewer'))
    expect(result[2].role).toBe('user')
    expect(result[2].content).toBe('review this')
  })

  it('passes through when there are no user messages at all', async () => {
    const agents = makeAgents('code-reviewer')
    const messages = [
      { role: 'system', content: 'Only system messages here' },
      { role: 'assistant', content: 'No user message' },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    expect(result).toEqual(messages)
  })

  it('case-sensitivity: @anvil:CODE-REVIEWER not dispatched', async () => {
    const agents = makeAgents('code-reviewer')
    const messages = [{ role: 'user', content: '@anvil:CODE-REVIEWER hi' }]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    // Not dispatched — pass through unchanged
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('@anvil:CODE-REVIEWER hi')
  })

  it('preserves extra message fields (passthrough semantics)', async () => {
    const agents = makeAgents('code-reviewer')
    const messages = [
      {
        role: 'user',
        content: '@anvil:code-reviewer hello',
        id: 'msg-1',
        extra: true,
      },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    expect(result).toHaveLength(2)
    // The stripped user message should still carry extra fields
    expect((result[1] as Record<string, unknown>).id).toBe('msg-1')
    expect((result[1] as Record<string, unknown>).extra).toBe(true)
  })

  it('tools field is included informationally in persona message (D-06)', async () => {
    const agents = new Map<string, ParsedAgent>([
      [
        'code-reviewer',
        {
          slug: 'code-reviewer',
          systemBody: 'Body.',
          tools: ['Read', 'Glob', 'Grep'],
        },
      ],
    ])
    const messages = [
      { role: 'user', content: '@anvil:code-reviewer check this' },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    expect(result[0].content).toContain('Read, Glob, Grep')
  })

  it('multi-message array: only first user message is evaluated', async () => {
    const agents = makeAgents('code-reviewer')
    const messages = [
      { role: 'user', content: '@anvil:code-reviewer review foo' },
      { role: 'assistant', content: 'I will review foo.' },
      { role: 'user', content: '@anvil:plan-verifier check this' },
    ]
    const result = await dispatchAgent(messages, agents, {
      logsDir: tmpLogsDir,
    })

    // First user message dispatched; third user message untouched
    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain(agentMarker('code-reviewer'))
    expect(result[result.length - 1].content).toBe(
      '@anvil:plan-verifier check this',
    )
  })
})

// ─── appendTelemetry tests ────────────────────────────────────────────────────

import { appendTelemetry } from '../../../src/opencode-plugin/agents/telemetry.js'

describe('appendTelemetry', () => {
  let tmpLogsDir2: string

  beforeEach(async () => {
    tmpLogsDir2 = join(
      tmpdir(),
      `anvil-telemetry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(tmpLogsDir2, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpLogsDir2, { recursive: true, force: true })
  })

  it('writes a JSONL line with correct shape', async () => {
    await appendTelemetry('code-reviewer', tmpLogsDir2)
    const content = await readFile(
      join(tmpLogsDir2, 'plugin-events.jsonl'),
      'utf-8',
    )
    const line = JSON.parse(content.trim()) as Record<string, unknown>
    expect(line.slug).toBe('code-reviewer')
    expect(line.kind).toBe('agent_dispatch')
    expect(line.source).toBe('opencode-plugin')
    expect(typeof line.ts).toBe('string')
  })

  it('appends multiple lines for multiple calls', async () => {
    await appendTelemetry('agent-a', tmpLogsDir2)
    await appendTelemetry('agent-b', tmpLogsDir2)
    const content = await readFile(
      join(tmpLogsDir2, 'plugin-events.jsonl'),
      'utf-8',
    )
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).slug).toBe('agent-a')
    expect(JSON.parse(lines[1]).slug).toBe('agent-b')
  })

  it('does not throw when log dir cannot be created (swallows errors)', async () => {
    // Passing a path under an existing file (not a dir) forces mkdir to fail,
    // which exercises the catch block in appendTelemetry.
    const notADir = join(tmpLogsDir2, 'file.txt')
    await writeFile(notADir, 'I am a file, not a dir')
    // Using notADir as the logsDir means mkdir will fail (it's a file).
    await expect(appendTelemetry('agent-a', notADir)).resolves.not.toThrow()
  })
})
