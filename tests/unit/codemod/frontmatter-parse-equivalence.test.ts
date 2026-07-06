/**
 * ANV-0206 Gate-1 regression: pre/post-migration parse equivalence.
 *
 * Verifies that SkillFrontmatter.transform and AgentFrontmatter.transform
 * return structurally-equivalent parsed objects for all Anvil-only fields
 * that the reviewer flagged as silently returning undefined on migrated files.
 *
 * For each field under scrutiny:
 *  - pre-migration: field is at root
 *  - post-migration: field is under x-anvil (as codemod produces)
 *  - assertion: parsed value is identical
 */

import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { AgentFrontmatter, SkillFrontmatter } from '../../../src/core/types.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSkill(yamlFm: string): SkillFrontmatter {
  const raw = `---\n${yamlFm}\n---\n\nSkill body.\n`
  const parsed = matter(raw)
  const result = SkillFrontmatter.safeParse(parsed.data)
  if (!result.success) {
    throw new Error(
      `SkillFrontmatter parse failed: ${JSON.stringify(result.error.issues)}`,
    )
  }
  return result.data
}

function parseAgent(yamlFm: string): AgentFrontmatter {
  const raw = `---\n${yamlFm}\n---\n\nAgent body.\n`
  const parsed = matter(raw)
  const result = AgentFrontmatter.safeParse(parsed.data)
  if (!result.success) {
    throw new Error(
      `AgentFrontmatter parse failed: ${JSON.stringify(result.error.issues)}`,
    )
  }
  return result.data
}

// ─── Skill parse-equivalence tests ───────────────────────────────────────────

describe('SkillFrontmatter — pre/post-migration parse equivalence ( Gate-1)', () => {
  // Minimal required skill fields shared by all fixtures
  const SKILL_BASE_ROOT = `name: test-skill
description: A test skill for parse equivalence.
preferred_model: claude-3-5-sonnet-20241022
preferred_effort: low`

  it('mcp_servers: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
mcp_servers:
  - name: example-server
    command: npx
    args: [example-mcp-server]`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  mcp_servers:
    - name: example-server
      command: npx
      args: [example-mcp-server]`)

    expect(pre.mcp_servers).toEqual(post.mcp_servers)
    expect(post.mcp_servers).toBeDefined()
  })

  it('activation: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
activation:
  languages: [typescript, javascript]`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  activation:
    languages: [typescript, javascript]`)

    expect(pre.activation).toEqual(post.activation)
    expect(post.activation).toBeDefined()
  })

  it('scripts/references/assets: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
scripts:
  - scripts/helper.sh
references:
  - docs/spec.md
assets:
  - templates/base.md`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  scripts:
    - scripts/helper.sh
  references:
    - docs/spec.md
  assets:
    - templates/base.md`)

    expect(pre.scripts).toEqual(post.scripts)
    expect(pre.references).toEqual(post.references)
    expect(pre.assets).toEqual(post.assets)
    expect(post.scripts).toBeDefined()
  })

  it('expected_tokens: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
expected_tokens: 1500`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  expected_tokens: 1500`)

    expect(pre.expected_tokens).toBe(post.expected_tokens)
    expect(post.expected_tokens).toBe(1500)
  })

  it('version: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
version: 1.2.3`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  version: 1.2.3`)

    expect(pre.version).toBe(post.version)
    expect(post.version).toBe('1.2.3')
  })

  it('provenance: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
provenance:
  author: anvil-team
  generatedBy: codemod`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  provenance:
    author: anvil-team
    generatedBy: codemod`)

    expect(pre.provenance).toEqual(post.provenance)
    expect(post.provenance).toBeDefined()
  })

  it('output_schema/input_schema: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
output_schema:
  type: object
input_schema:
  type: string`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  output_schema:
    type: object
  input_schema:
    type: string`)

    expect(pre.output_schema).toEqual(post.output_schema)
    expect(pre.input_schema).toEqual(post.input_schema)
    expect(post.output_schema).toBeDefined()
  })

  it('notepads_section: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
notepads_section: learnings`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  notepads_section: learnings`)

    expect(pre.notepads_section).toBe(post.notepads_section)
    expect(post.notepads_section).toBe('learnings')
  })

  it('disambiguator: root vs x-anvil', () => {
    const pre = parseSkill(`${SKILL_BASE_ROOT}
disambiguator: Test`)

    const post = parseSkill(`${SKILL_BASE_ROOT}
x-anvil:
  disambiguator: Test`)

    expect(pre.disambiguator).toBe(post.disambiguator)
    expect(post.disambiguator).toBe('Test')
  })
})

// ─── Agent parse-equivalence tests ───────────────────────────────────────────

describe('AgentFrontmatter — pre/post-migration parse equivalence ( Gate-1)', () => {
  const AGENT_BASE_ROOT = `name: test-worker
description: A test agent for parse equivalence.`

  it('required_reading: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
required_reading:
  - .anvil/specs/anvil-design.md`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  required_reading:
    - .anvil/specs/anvil-design.md`)

    expect(pre.required_reading).toEqual(post.required_reading)
    expect(post.required_reading).toEqual(['.anvil/specs/anvil-design.md'])
  })

  it('output_schema: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
output_schema:
  type: object`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  output_schema:
    type: object`)

    expect(pre.output_schema).toEqual(post.output_schema)
    expect(post.output_schema).toBeDefined()
  })

  it('fallback_chain: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
fallback_chain:
  - claude-3-haiku-20240307`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  fallback_chain:
    - claude-3-haiku-20240307`)

    expect(pre.fallback_chain).toEqual(post.fallback_chain)
    expect(post.fallback_chain).toEqual(['claude-3-haiku-20240307'])
  })

  it('role: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
role: worker`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  role: worker`)

    expect(pre.role).toBe(post.role)
    expect(post.role).toBe('worker')
  })

  it('tier: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
tier: coding`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  tier: coding`)

    expect(pre.tier).toBe(post.tier)
    expect(post.tier).toBe('coding')
  })

  it('agent_mode: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
agent_mode: primary`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  agent_mode: primary`)

    expect(pre.agent_mode).toBe(post.agent_mode)
    expect(post.agent_mode).toBe('primary')
  })

  it('requires_any_model + requires_provider: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
requires_any_model:
  - claude-opus-4-5
requires_provider: anthropic`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  requires_any_model:
    - claude-opus-4-5
  requires_provider: anthropic`)

    expect(pre.requires_any_model).toEqual(post.requires_any_model)
    expect(pre.requires_provider).toBe(post.requires_provider)
    expect(post.requires_any_model).toEqual(['claude-opus-4-5'])
    expect(post.requires_provider).toBe('anthropic')
  })

  it('notepads_section: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
notepads_section: decisions`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  notepads_section: decisions`)

    expect(pre.notepads_section).toBe(post.notepads_section)
    expect(post.notepads_section).toBe('decisions')
  })

  it('expected_tokens: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
expected_tokens: 8000`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  expected_tokens: 8000`)

    expect(pre.expected_tokens).toBe(post.expected_tokens)
    expect(post.expected_tokens).toBe(8000)
  })

  it('category: root vs x-anvil', () => {
    const pre = parseAgent(`${AGENT_BASE_ROOT}
category: code-quality`)

    const post = parseAgent(`${AGENT_BASE_ROOT}
x-anvil:
  category: code-quality`)

    expect(pre.category).toBe(post.category)
    expect(post.category).toBe('code-quality')
  })
})
