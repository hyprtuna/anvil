/**
 * ANV-0103 — Doctor row test for bootstrap content version-skew check.
 *
 * Tests pushBootstrapSkewCheck() using a real temporary directory containing
 * a skills/ tree and a bootstrap SKILL.md. No process.exit() is called.
 *
 * Pattern mirrors doctor-doc-drift-row.test.ts:
 *   - pure function exported from doctor.ts
 *   - temp dir with fixture files
 *   - assert on resulting Check[] shape
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushBootstrapSkewCheck } from '../../../src/commands/cli/doctor.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

interface Check {
  name: string
  status: CheckStatus
  detail: string
}

let tmpRoot: string

beforeEach(() => {
  tmpRoot = join(tmpdir(), `anvil-bsr-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function write(relPath: string, content: string): void {
  const abs = join(tmpRoot, relPath)
  mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}

/**
 * Minimal valid skill frontmatter + body.
 */
function skillFile(name: string, extra = ''): string {
  return `---
name: ${name}
kind: atomic
group: development
description: Test skill ${name}
preferred_model: balanced
preferred_effort: low
language: universal
user-invocable: false
---

## Status

Announce: I'm using the ${name} skill.

${extra}

## Done — status: DONE
`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pushBootstrapSkewCheck — skip when not in Anvil project', () => {
  it('skip: no skills/ tree → emits skip row', async () => {
    const checks: Check[] = []
    await pushBootstrapSkewCheck(checks, tmpRoot, join(tmpRoot, '.anvil'))
    expect(checks).toHaveLength(1)
    expect(checks[0]?.status).toBe('skip')
    expect(checks[0]?.name).toBe('Bootstrap slug references (version-skew)')
  })
})

describe('pushBootstrapSkewCheck — bootstrap file absent', () => {
  it('warn: skills/ tree present but bootstrap missing', async () => {
    mkdirSync(join(tmpRoot, 'skills', 'universal'), { recursive: true })
    const checks: Check[] = []
    await pushBootstrapSkewCheck(checks, tmpRoot, join(tmpRoot, '.anvil'))
    expect(checks).toHaveLength(1)
    expect(checks[0]?.status).toBe('warn')
    expect(checks[0]?.detail).toContain('anvil init')
  })
})

describe('pushBootstrapSkewCheck — all references resolve', () => {
  it('pass: Skill() and Agent() references all exist in registry', async () => {
    // Create skills/universal/ with two skills
    write('skills/universal/code-review.md', skillFile('code-review'))
    write('skills/universal/planning.md', skillFile('planning'))

    // Create agents/
    write(
      'agents/code-architect.md',
      `---
name: code-architect
description: Heavyweight architectural review
tier: planning
permissionMode: plan
color: purple
tools: [Read]
role: worker
group: planning
---

Body.
`,
    )

    // Create bootstrap referencing those skills and agents
    const bootstrapBody = `---
name: using-anvil
kind: meta
group: meta
description: Bootstrap
preferred_model: balanced
preferred_effort: low
language: universal
user-invocable: false
---

## Status

- \`Skill({skill: "anvil:code-review"})\`
- \`Skill({skill: "anvil:planning"})\`
- \`Agent({subagent_type: "anvil:code-architect"})\`

## Done — status: DONE
`
    write('skills/using-anvil/SKILL.md', bootstrapBody)

    const checks: Check[] = []
    await pushBootstrapSkewCheck(checks, tmpRoot, join(tmpRoot, '.anvil'))

    expect(checks).toHaveLength(1)
    expect(checks[0]?.status).toBe('pass')
    expect(checks[0]?.detail).toContain('resolve')
  })
})

describe('pushBootstrapSkewCheck — dangling references (acceptance criteria)', () => {
  it('fail: renamed skill leaves dangling Skill() reference', async () => {
    // Create skills/ with "code-reviewing" (the new name)
    write('skills/universal/code-reviewing.md', skillFile('code-reviewing'))
    // Bootstrap still references old name "code-review"
    const bootstrapBody = `---
name: using-anvil
kind: meta
group: meta
description: Bootstrap
preferred_model: balanced
preferred_effort: low
language: universal
user-invocable: false
---

## Status

- \`Skill({skill: "anvil:code-review"})\`

## Done — status: DONE
`
    write('skills/using-anvil/SKILL.md', bootstrapBody)

    const checks: Check[] = []
    await pushBootstrapSkewCheck(checks, tmpRoot, join(tmpRoot, '.anvil'))

    expect(checks).toHaveLength(1)
    expect(checks[0]?.status).toBe('fail')
    expect(checks[0]?.detail).toContain('anvil:code-review')
  })

  it('fail: dangling reference includes remediation hint', async () => {
    write('skills/universal/some-skill.md', skillFile('some-skill'))
    const bootstrapBody = `---
name: using-anvil
kind: meta
group: meta
description: Bootstrap
preferred_model: balanced
preferred_effort: low
language: universal
user-invocable: false
---

## Status

\`Skill({skill: "anvil:nonexistent-skill"})\`

## Done — status: DONE
`
    write('skills/using-anvil/SKILL.md', bootstrapBody)

    const checks: Check[] = []
    await pushBootstrapSkewCheck(checks, tmpRoot, join(tmpRoot, '.anvil'))

    expect(checks[0]?.status).toBe('fail')
    // Remediation hint must guide user to fix the reference
    expect(checks[0]?.detail).toMatch(
      /skills\/using-anvil\/SKILL\.md|anvil init/,
    )
  })
})

describe('pushBootstrapSkewCheck — row label', () => {
  it('row name is "Bootstrap slug references (version-skew)"', async () => {
    // Just confirm the constant without triggering full scan
    const checks: Check[] = []
    await pushBootstrapSkewCheck(checks, tmpRoot, join(tmpRoot, '.anvil'))
    // skip row still has the correct name
    expect(checks[0]?.name).toBe('Bootstrap slug references (version-skew)')
  })
})
