/**
 * ANV-0103 — Unit tests for the bootstrap/anvil-slug-references DoctorCheck.
 *
 * Three cases:
 *   (a) all references resolve → pass row
 *   (b) one dangling reference → warn row
 *   (c) bootstrap file missing → skip row (pass-with-skip so OC-less users aren't blocked)
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BOOTSTRAP_CHECKS,
  bootstrapSlugReferencesCheck,
} from '../../../../../src/commands/cli/doctor-checks/bootstrap.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../../../../src/commands/cli/doctor-registry.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpRoot: string

function makeCtx(
  overrides: Partial<DoctorCheckContext> = {},
): DoctorCheckContext {
  return {
    cwd: tmpRoot,
    home: tmpRoot,
    anvilHome: join(tmpRoot, '.anvil'),
    inProject: true,
    skipDetail: 'not in project',
    installScope: 'unknown',
    ...overrides,
  }
}

function write(relPath: string, content: string): void {
  const abs = join(tmpRoot, relPath)
  mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}

function skillFile(name: string): string {
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

## Done — status: DONE
`
}

function agentFile(name: string): string {
  return `---
name: ${name}
description: Test agent ${name}
tier: planning
permissionMode: plan
color: purple
tools: [Read]
role: worker
group: planning
---

Body.
`
}

function bootstrapFile(body: string): string {
  return `---
name: using-anvil
kind: meta
group: meta
description: Bootstrap
preferred_model: balanced
preferred_effort: low
language: universal
user-invocable: false
---

${body}

## Done — status: DONE
`
}

beforeEach(() => {
  tmpRoot = join(tmpdir(), `anv-0103-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// (a) All references resolve → pass
// ---------------------------------------------------------------------------

describe('bootstrapSlugReferencesCheck — all references resolve', () => {
  it('pass: Skill() and Agent() references all exist in registry', async () => {
    write('skills/universal/code-review.md', skillFile('code-review'))
    write('skills/universal/planning.md', skillFile('planning'))
    write('agents/code-architect.md', agentFile('code-architect'))
    write(
      'skills/using-anvil/SKILL.md',
      bootstrapFile(
        '- `Skill({skill: "anvil:code-review"})`\n' +
          '- `Skill({skill: "anvil:planning"})`\n' +
          '- `Agent({subagent_type: "anvil:code-architect"})`',
      ),
    )

    const ctx = makeCtx()
    const rows: DoctorCheckRow[] = []
    await bootstrapSlugReferencesCheck.runner(ctx, rows)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
    expect(rows[0]?.detail).toContain('resolve')
  })
})

// ---------------------------------------------------------------------------
// (b) One dangling reference → warn
// ---------------------------------------------------------------------------

describe('bootstrapSlugReferencesCheck — dangling reference', () => {
  it('warn: renamed skill leaves dangling Skill() reference', async () => {
    // Registry has "code-reviewing" but bootstrap references "code-review"
    write('skills/universal/code-reviewing.md', skillFile('code-reviewing'))
    write(
      'skills/using-anvil/SKILL.md',
      bootstrapFile('- `Skill({skill: "anvil:code-review"})`'),
    )

    const ctx = makeCtx()
    const rows: DoctorCheckRow[] = []
    await bootstrapSlugReferencesCheck.runner(ctx, rows)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('warn')
    expect(rows[0]?.detail).toContain('anvil:code-review')
  })

  it('warn: remediation hint mentions skills/using-anvil/SKILL.md or anvil init', async () => {
    write('skills/universal/some-skill.md', skillFile('some-skill'))
    write(
      'skills/using-anvil/SKILL.md',
      bootstrapFile('`Skill({skill: "anvil:nonexistent-skill"})`'),
    )

    const ctx = makeCtx()
    const rows: DoctorCheckRow[] = []
    await bootstrapSlugReferencesCheck.runner(ctx, rows)

    expect(rows[0]?.status).toBe('warn')
    expect(rows[0]?.detail).toMatch(/skills\/using-anvil\/SKILL\.md|anvil init/)
  })
})

// ---------------------------------------------------------------------------
// (c) Bootstrap file missing → skip (pass-with-skip)
// ---------------------------------------------------------------------------

describe('bootstrapSlugReferencesCheck — bootstrap file missing', () => {
  it('skip: skills/ tree present but bootstrap file absent', async () => {
    mkdirSync(join(tmpRoot, 'skills', 'universal'), { recursive: true })

    const ctx = makeCtx()
    const rows: DoctorCheckRow[] = []
    await bootstrapSlugReferencesCheck.runner(ctx, rows)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('skip')
  })

  it('skip: no skills/ tree at all', async () => {
    const ctx = makeCtx()
    const rows: DoctorCheckRow[] = []
    await bootstrapSlugReferencesCheck.runner(ctx, rows)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('skip')
  })
})

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

describe('BOOTSTRAP_CHECKS registry', () => {
  it('exports BOOTSTRAP_CHECKS with bootstrapSlugReferencesCheck entry', () => {
    expect(BOOTSTRAP_CHECKS).toContain(bootstrapSlugReferencesCheck)
  })

  it('check has id bootstrap/anvil-slug-references', () => {
    expect(bootstrapSlugReferencesCheck.id).toBe(
      'bootstrap/anvil-slug-references',
    )
  })

  it('check category is content', () => {
    expect(bootstrapSlugReferencesCheck.category).toBe('content')
  })
})
