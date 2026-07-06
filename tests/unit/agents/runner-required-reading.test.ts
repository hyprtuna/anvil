/**
 * Integration: prepareInvocation injects <required_reading> verbatim before
 * the agent body. Plan 43 Phase I — Item 23.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { prepareInvocation } from '../../../src/agents/runner.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { AgentRegistry } from '../../../src/core/registry/agent-registry.js'
import type { Agent } from '../../../src/core/types.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

let tmp: string

beforeEach(() => {
  tmp = createTestTmpDir('runner-rr')
  mkdirSync(join(tmp, 'skills'), { recursive: true })
})

function makeAgent(required_reading?: string[]): Agent {
  return {
    frontmatter: {
      name: 'test-agent',
      description: 'test',
      model: 'inherit',
      tools: ['Read'],
      trigger: [],
      max_turns: 20,
      fallback_chain: [],
      agent_mode: 'subagent',
      ...(required_reading ? { required_reading } : {}),
    } as Agent['frontmatter'],
    body: '# Agent body content',
    sourcePath: '/agents/test-agent.md',
  }
}

describe('prepareInvocation + required_reading', () => {
  it('prepends a <required_reading> block before the agent body when listed', () => {
    writeFileSync(join(tmp, 'skills', 'guide.md'), 'Guide content here.\n')

    const reg = new AgentRegistry()
    reg.register(makeAgent(['skills/guide.md']))

    const invocation = prepareInvocation(
      reg,
      buildDefaultConfig(),
      'test-agent',
      'do the thing',
      { cwd: tmp },
    )

    expect(invocation.prompt).toContain('<required_reading>')
    expect(invocation.prompt).toContain('### skills/guide.md')
    expect(invocation.prompt).toContain('Guide content here.')
    expect(invocation.prompt).toContain('</required_reading>')

    // The block must appear before the agent body in the joined prompt.
    const blockIdx = invocation.prompt.indexOf('<required_reading>')
    const bodyIdx = invocation.prompt.indexOf('# Agent body content')
    expect(blockIdx).toBeGreaterThanOrEqual(0)
    expect(bodyIdx).toBeGreaterThan(blockIdx)
  })

  it('omits the block when no required_reading is declared', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent())

    const invocation = prepareInvocation(
      reg,
      buildDefaultConfig(),
      'test-agent',
      'go',
      { cwd: tmp },
    )

    expect(invocation.prompt).not.toContain('<required_reading>')
  })

  it('omits the block when no listed file is readable', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent(['skills/missing.md']))

    const invocation = prepareInvocation(
      reg,
      buildDefaultConfig(),
      'test-agent',
      'go',
      { cwd: tmp },
    )

    expect(invocation.prompt).not.toContain('<required_reading>')
  })
})
