import { describe, expect, it } from 'vitest'
import { loadAllAgents } from '../../src/agents/load-all.js'

describe('integration: loadAllAgents', () => {
  // ANV-0083 — 4 single-use review/audit agents collapsed into sibling
  // Task(general-purpose) prompts under their consuming skill: assumptions-surfacer,
  // comment-analyzer, type-design-analyzer, retroactive-validator. Remaining: 18.
  it('loads all 18 shipped agents', async () => {
    const reg = await loadAllAgents({ agentsRoot: 'agents' })
    const names = reg
      .getAll()
      .map((a) => a.frontmatter.name)
      .sort()
    expect(names).toEqual([
      'build-error-resolver',
      'code-architect',
      'code-explorer',
      'code-quality-reviewer',
      'code-reviewer',
      'code-simplifier',
      'doc-verifier',
      'framework-selector',
      'mcp-builder',
      'orchestrator',
      'plan-verifier',
      'researcher',
      'silent-failure-hunter',
      'spec-reviewer',
      'strict-reviewer',
      'subagent-executor',
      'test-analyzer',
      'ultra-worker',
    ])
  })
})
