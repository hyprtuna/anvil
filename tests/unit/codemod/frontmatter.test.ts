/**
 * ANV-0206 — Unit tests for the x-anvil frontmatter codemod.
 *
 * 8 tests covering:
 * 1. Agent migration: Anvil-only fields move to x-anvil
 * 2. Agent migration: MCP 4-tuple collapses to x-anvil.safety
 * 3. Agent idempotency: already-migrated files produce no diff
 * 4. Skill migration: Anvil-only fields move to x-anvil
 * 5. Skill migration: composition fields collapse to x-anvil.composition
 * 6. Root-stay fields remain at root
 * 7. File without frontmatter is skipped (not changed)
 * 8. x-anvil block absent when no Anvil-only fields present
 */

import { describe, expect, it } from 'vitest'
import { migrateFile } from '../../../scripts/dev/codemod-frontmatter.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgentFile(
  fields: Record<string, unknown>,
  body = 'Agent body.',
): string {
  const fm = Object.entries(fields)
    .map(([k, v]) => {
      if (typeof v === 'string') return `${k}: ${v}`
      if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`
      if (typeof v === 'boolean') return `${k}: ${v}`
      return `${k}: ${JSON.stringify(v)}`
    })
    .join('\n')
  return `---\n${fm}\n---\n\n${body}\n`
}

function parseFrontmatterKeys(content: string): string[] {
  const end = content.indexOf('\n---', 3)
  const fm = content.slice(3, end)
  return fm
    .split('\n')
    .filter((l) => /^[a-zA-Z]/.test(l))
    .map((l) => l.split(':')[0]?.trim() ?? '')
    .filter(Boolean)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('codemod-frontmatter', () => {
  it('1. agent: Anvil-only fields move to x-anvil', () => {
    const input = makeAgentFile({
      name: 'test-agent',
      description: 'Test agent',
      permissionMode: 'plan',
      color: 'blue',
      tools: ['Read', 'Bash'],
      tier: 'ultra',
      role: 'worker',
      group: 'planning',
      trigger: ['test'],
    })

    const result = migrateFile('test-agent.md', input)

    expect(result.changed).toBe(true)
    // Root should have CC-native fields
    const rootKeys = parseFrontmatterKeys(result.output)
    expect(rootKeys).toContain('name')
    expect(rootKeys).toContain('description')
    expect(rootKeys).toContain('permissionMode')
    expect(rootKeys).toContain('color')
    expect(rootKeys).toContain('tools')
    expect(rootKeys).toContain('x-anvil')
    // Anvil-only fields should NOT be at root
    expect(rootKeys).not.toContain('tier')
    expect(rootKeys).not.toContain('role')
    expect(rootKeys).not.toContain('group')
    // x-anvil block should contain Anvil-only fields
    expect(result.output).toContain('tier: ultra')
    expect(result.output).toContain('role: worker')
    expect(result.output).toContain('group: planning')
  })

  it('2. agent: MCP 4-tuple hint fields are dropped entirely (not migrated)', () => {
    const input = makeAgentFile({
      name: 'test-agent',
      description: 'Test agent',
      tools: ['Read'],
      tier: 'ultra',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    })

    const result = migrateFile('test-agent.md', input)

    expect(result.changed).toBe(true)
    // 4-tuple fields should be gone entirely
    expect(result.output).not.toMatch(/^readOnlyHint:/m)
    expect(result.output).not.toMatch(/^destructiveHint:/m)
    expect(result.output).not.toMatch(/^idempotentHint:/m)
    expect(result.output).not.toMatch(/^openWorldHint:/m)
    // no safety block should appear
    expect(result.output).not.toContain('safety:')
    // x-anvil block exists (tier migrated) but has no safety sub-key
    expect(result.output).toContain('x-anvil:')
    expect(result.output).toContain('tier: ultra')
  })

  it('3. agent: already-migrated file is idempotent (no change)', () => {
    const input =
      '---\nname: test-agent\ndescription: Test agent\ntools: [Read]\nx-anvil:\n  tier: ultra\n  role: worker\n---\n\nBody.\n'

    const result = migrateFile('test-agent.md', input)

    expect(result.changed).toBe(false)
    expect(result.output).toBe(input)
  })

  it('4. skill: Anvil-only fields move to x-anvil', () => {
    const input = `---
name: my-skill
description: Test skill
preferred_model: opus
preferred_effort: high
kind: atomic
group: review
language: universal
tags: [foo, bar]
trigger: [review]
disambiguator: graded reviewer
---

Skill body.
`

    const result = migrateFile('my-skill.md', input)

    expect(result.changed).toBe(true)
    // preferred_model, preferred_effort stay at root (ANV-0214 deferred)
    expect(result.output).toMatch(/^preferred_model:/m)
    expect(result.output).toMatch(/^preferred_effort:/m)
    // Anvil-only fields should NOT be at root
    expect(result.output).not.toMatch(/^kind:/m)
    expect(result.output).not.toMatch(/^group:/m)
    expect(result.output).not.toMatch(/^language:/m)
    expect(result.output).not.toMatch(/^tags:/m)
    expect(result.output).not.toMatch(/^trigger:/m)
    expect(result.output).not.toMatch(/^disambiguator:/m)
    // x-anvil block exists and contains migrated fields
    expect(result.output).toContain('x-anvil:')
    expect(result.output).toContain('kind: atomic')
    expect(result.output).toContain('group: review')
  })

  it('5. skill: composition fields collapse to x-anvil.composition', () => {
    const input = `---
name: composite-skill
description: Test
preferred_model: opus
preferred_effort: high
sub_skills: [child-a, child-b]
strategy: append
extends_skill: core-skill
---

Body.
`

    const result = migrateFile('composite-skill.md', input)

    expect(result.changed).toBe(true)
    // Composition fields NOT at root
    expect(result.output).not.toMatch(/^sub_skills:/m)
    expect(result.output).not.toMatch(/^strategy:/m)
    expect(result.output).not.toMatch(/^extends_skill:/m)
    // Composition under x-anvil
    expect(result.output).toContain('composition:')
    expect(result.output).toContain('sub_skills:')
    expect(result.output).toContain('strategy: append')
    expect(result.output).toContain('extends_skill: core-skill')
  })

  it('6. root-stay fields remain at root', () => {
    const input = makeAgentFile({
      name: 'test-agent',
      description: 'Test agent',
      model: 'balanced',
      permissionMode: 'plan',
      color: 'blue',
      tools: ['Read'],
      disallowedTools: ['Bash'],
      background: true,
      isolation: 'worktree',
      tier: 'quick',
    })

    const result = migrateFile('test-agent.md', input)

    // CC-native fields stay at root
    expect(result.output).toMatch(/^name:/m)
    expect(result.output).toMatch(/^description:/m)
    expect(result.output).toMatch(/^model:/m)
    expect(result.output).toMatch(/^permissionMode:/m)
    expect(result.output).toMatch(/^color:/m)
    expect(result.output).toMatch(/^tools:/m)
    expect(result.output).toMatch(/^disallowedTools:/m)
    expect(result.output).toMatch(/^background:/m)
    expect(result.output).toMatch(/^isolation:/m)
    // tier moves to x-anvil
    expect(result.output).not.toMatch(/^tier:/m)
    expect(result.output).toContain('tier: quick')
  })

  it('7. file without frontmatter is not changed', () => {
    const input = 'No frontmatter here.\n\nJust markdown.\n'

    const result = migrateFile('no-fm.md', input)

    expect(result.changed).toBe(false)
    expect(result.output).toBe(input)
  })

  it('8. file with only CC-native fields produces no x-anvil block', () => {
    const input = `---
name: simple-agent
description: A simple agent
model: balanced
tools: [Read]
---

Body.
`

    const result = migrateFile('simple-agent.md', input)

    // No Anvil-only fields to move → x-anvil block should not be added
    expect(result.changed).toBe(false)
    expect(result.output).not.toContain('x-anvil')
  })
})
