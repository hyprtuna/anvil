import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseAgentFile,
  toOcMode,
} from '../../../src/opencode-plugin/agents/parse.js'
import { loadAgents } from '../../../src/opencode-plugin/agents/registry.js'

/**
 * ANV-0207 — OC adapter mode injection tests.
 *
 * Verifies that:
 * 1. `toOcMode` maps 'primary' → 'primary', anything else → 'subagent'.
 * 2. `parseAgentFile` sets `mode: 'primary'` when `agent_mode: primary` is in frontmatter.
 * 3. `parseAgentFile` defaults to `mode: 'subagent'` when `agent_mode` is absent.
 * 4. `loadAgents` propagates `mode` correctly for all loaded agents.
 * 5. 'all' is never emitted — Anvil invariant.
 */

// ─── toOcMode unit tests ──────────────────────────────────────────────────────

describe('toOcMode', () => {
  it("maps 'primary' to 'primary'", () => {
    expect(toOcMode('primary')).toBe('primary')
  })

  it("maps 'subagent' to 'subagent'", () => {
    expect(toOcMode('subagent')).toBe('subagent')
  })

  it("defaults to 'subagent' when agent_mode is undefined", () => {
    expect(toOcMode(undefined)).toBe('subagent')
  })

  it("defaults to 'subagent' for unrecognised values", () => {
    expect(toOcMode('all')).toBe('subagent')
    expect(toOcMode('')).toBe('subagent')
    expect(toOcMode('unknown')).toBe('subagent')
  })

  it("never returns 'all'", () => {
    for (const input of [
      undefined,
      'primary',
      'subagent',
      'all',
      '',
      'other',
    ]) {
      const result = toOcMode(input)
      expect(
        result,
        `toOcMode(${JSON.stringify(input)}) must not return 'all'`,
      ).not.toBe('all')
    }
  })
})

// ─── parseAgentFile mode tests ────────────────────────────────────────────────

describe('parseAgentFile — mode field', () => {
  it("emits mode: 'primary' when agent_mode: primary is in x-anvil block", () => {
    const content = `---
name: orchestrator
description: Primary orchestrator agent
x-anvil:
  tier: planning
  role: orchestrator
  agent_mode: primary
---

You are the orchestrator. You fan out tasks.`
    const result = parseAgentFile(content, 'orchestrator.md')
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('primary')
  })

  it("emits mode: 'subagent' when agent_mode is absent", () => {
    const content = `---
name: code-reviewer
description: Reviews code for quality
tools: [Read, Grep]
---

You are the code reviewer.`
    const result = parseAgentFile(content, 'code-reviewer.md')
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('subagent')
  })

  it("emits mode: 'subagent' when agent_mode: subagent is explicit", () => {
    const content = `---
name: code-explorer
description: Explores codebase
x-anvil:
  tier: quick
  agent_mode: subagent
---

You explore the codebase.`
    const result = parseAgentFile(content, 'code-explorer.md')
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('subagent')
  })

  it("never emits mode: 'all'", () => {
    const cases = [
      '---\nname: agent-a\ndescription: A\n---\n\nBody.',
      '---\nname: agent-b\ndescription: B\nx-anvil:\n  agent_mode: primary\n---\n\nBody.',
      '---\nname: agent-c\ndescription: C\nx-anvil:\n  agent_mode: subagent\n---\n\nBody.',
    ]
    for (const content of cases) {
      const result = parseAgentFile(content)
      expect(result).not.toBeNull()
      expect(result!.mode).not.toBe('all')
    }
  })
})

// ─── loadAgents mode propagation tests ───────────────────────────────────────

describe('loadAgents — mode propagation', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(
      tmpdir(),
      `anvil-mode-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(join(tmpRoot, 'agents'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('sets mode: primary for agents with agent_mode: primary', async () => {
    await writeFile(
      join(tmpRoot, 'agents', 'primary-agent.md'),
      '---\nname: primary-agent\ndescription: Primary\nx-anvil:\n  agent_mode: primary\n---\n\nPrimary body.',
    )
    const map = await loadAgents(tmpRoot)
    expect(map.get('primary-agent')!.mode).toBe('primary')
  })

  it('sets mode: subagent for agents without agent_mode (default)', async () => {
    await writeFile(
      join(tmpRoot, 'agents', 'sub-agent.md'),
      '---\nname: sub-agent\ndescription: Subagent\n---\n\nSubagent body.',
    )
    const map = await loadAgents(tmpRoot)
    expect(map.get('sub-agent')!.mode).toBe('subagent')
  })

  it('correctly assigns mode to multiple agents with mixed agent_mode values', async () => {
    await writeFile(
      join(tmpRoot, 'agents', 'worker.md'),
      '---\nname: ultra-worker\ndescription: Worker\nx-anvil:\n  agent_mode: primary\n---\n\nWorker body.',
    )
    await writeFile(
      join(tmpRoot, 'agents', 'explorer.md'),
      '---\nname: code-explorer\ndescription: Explorer\n---\n\nExplorer body.',
    )
    await writeFile(
      join(tmpRoot, 'agents', 'reviewer.md'),
      '---\nname: code-reviewer\ndescription: Reviewer\nx-anvil:\n  agent_mode: subagent\n---\n\nReviewer body.',
    )
    const map = await loadAgents(tmpRoot)
    expect(map.get('ultra-worker')!.mode).toBe('primary')
    expect(map.get('code-explorer')!.mode).toBe('subagent')
    expect(map.get('code-reviewer')!.mode).toBe('subagent')
  })
})
