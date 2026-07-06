/**
 * ANV-0138 — Unit tests for the surfaces-audit core dimension checks.
 *
 * One good and one bad fixture per dimension. The checks are pure: they take
 * a Surface (frontmatter + body + kind + path) and return a DimensionResult.
 *
 * ANV-0212: model and effort dimension checks for skills now use the bundled
 * skill registry (`resolveSkillAssignment`) instead of reading
 * `preferred_model`/`preferred_effort` from raw frontmatter.
 * - A skill name that exists in BUNDLED_SKILL_REGISTRY → pass.
 * - A skill name absent from the registry → flag (checkModel) or na (checkEffort).
 */

import { describe, expect, it } from 'vitest'
import {
  type AuditRow,
  type Surface,
  aggregateMatrix,
  auditSurface,
  checkEffort,
  checkInvocable,
  checkModel,
  checkOcVisible,
  checkTemplates,
  checkTools,
  isRowFlagged,
} from '../../../../src/core/audit/surfaces.js'

// 'planning' is a known registry entry (planning group → opus/high).
const KNOWN_SKILL = 'planning'
// 'haiku-skill-fixture' is a name not in the registry.
const UNKNOWN_SKILL = 'fixture-not-in-registry'
// 'doc-writing' is a haiku-class skill (effort intentionally absent in registry).
const HAIKU_SKILL = 'doc-writing'

function skill(opts: {
  name?: string
  path?: string
  fm?: Record<string, unknown>
  body?: string
}): Surface {
  return {
    name: opts.name ?? UNKNOWN_SKILL,
    kind: 'skill',
    path: opts.path ?? '/fake/skills/universal/fixture.md',
    frontmatter: opts.fm ?? {},
    body: opts.body ?? '',
  }
}

function agent(opts: {
  name?: string
  path?: string
  fm?: Record<string, unknown>
  body?: string
}): Surface {
  return {
    name: opts.name ?? 'fixture-er',
    kind: 'agent',
    path: opts.path ?? '/fake/agents/fixture-er.md',
    frontmatter: opts.fm ?? {},
    body: opts.body ?? '',
  }
}

// ---------------------------------------------------------------------------
// Dimension: templates
// ---------------------------------------------------------------------------

describe('checkTemplates', () => {
  it('passes when no embedded-template marker is present', () => {
    const s = skill({ body: 'just prose, nothing structural' })
    expect(checkTemplates(s).status).toBe('pass')
  })

  it('flags a body with the marker but no templates: field', () => {
    const s = skill({
      body: 'leading prose\n<!-- template-prose -->\nBlock body',
      fm: { name: 'fixture' },
    })
    expect(checkTemplates(s).status).toBe('flag')
  })

  it('passes when both the marker and the templates: field are present', () => {
    const s = skill({
      body: 'before\n<!-- template-prose -->\nstructured',
      fm: { templates: ['decisions'] },
    })
    expect(checkTemplates(s).status).toBe('pass')
  })
})

// ---------------------------------------------------------------------------
// Dimension: model
// ---------------------------------------------------------------------------

describe('checkModel', () => {
  // ANV-0212: skills now use registry-coverage check, not preferred_model frontmatter.

  it('passes a skill whose name is in the bundled registry', () => {
    const s = skill({ name: KNOWN_SKILL })
    expect(checkModel(s).status).toBe('pass')
  })

  it('includes the registry model in the pass note', () => {
    const s = skill({ name: KNOWN_SKILL })
    const result = checkModel(s)
    expect(result.note).toContain('registry model=')
  })

  it('flags a skill whose name is absent from the bundled registry', () => {
    const s = skill({ name: UNKNOWN_SKILL })
    expect(checkModel(s).status).toBe('flag')
  })

  it('flag note mentions registry entry and how to fix', () => {
    const s = skill({ name: UNKNOWN_SKILL })
    const result = checkModel(s)
    expect(result.note).toContain('no registry entry')
  })

  it('passes a skill even if frontmatter has no preferred_model (registry is the source)', () => {
    // preferred_model in frontmatter is now irrelevant; only registry membership matters.
    const s = skill({ name: KNOWN_SKILL, fm: {} })
    expect(checkModel(s).status).toBe('pass')
  })

  it('passes an agent that declares model', () => {
    const a = agent({ fm: { model: 'inherit' } })
    expect(checkModel(a).status).toBe('pass')
  })

  it('passes an agent that declares only a tier', () => {
    const a = agent({ fm: { tier: 'planning' } })
    expect(checkModel(a).status).toBe('pass')
  })

  it('flags an agent that declares neither model nor tier', () => {
    const a = agent({ fm: {} })
    expect(checkModel(a).status).toBe('flag')
  })
})

// ---------------------------------------------------------------------------
// Dimension: effort
// ---------------------------------------------------------------------------

describe('checkEffort', () => {
  // ANV-0212: skills now use registry-coverage check, not preferred_effort frontmatter.

  it('passes a skill whose registry entry has an effort value', () => {
    // 'planning' → opus/high; effort='high' is present in registry.
    const s = skill({ name: KNOWN_SKILL })
    expect(checkEffort(s).status).toBe('pass')
  })

  it('includes the registry effort in the pass note', () => {
    const s = skill({ name: KNOWN_SKILL })
    const result = checkEffort(s)
    expect(result.note).toContain('registry effort=')
  })

  it('passes a haiku-class skill (effort intentionally absent in registry)', () => {
    // 'doc-writing' → haiku; effort is intentionally absent for Haiku-class skills.
    const s = skill({ name: HAIKU_SKILL })
    expect(checkEffort(s).status).toBe('pass')
  })

  it('haiku-class pass note mentions Haiku class', () => {
    const s = skill({ name: HAIKU_SKILL })
    const result = checkEffort(s)
    expect(result.note).toContain('Haiku')
  })

  it('returns na for a skill absent from the registry (checkModel handles the flag)', () => {
    // checkModel already flags unknown-registry skills; checkEffort returns na to avoid
    // double-flagging the same root cause.
    const s = skill({ name: UNKNOWN_SKILL })
    expect(checkEffort(s).status).toBe('na')
  })

  it('passes an agent with valid effort', () => {
    expect(checkEffort(agent({ fm: { effort: 'high' } })).status).toBe('pass')
  })

  it('flags an agent with invalid effort enum value', () => {
    expect(checkEffort(agent({ fm: { effort: 'turbo' } })).status).toBe('flag')
  })
})

// ---------------------------------------------------------------------------
// Dimension: tools
// ---------------------------------------------------------------------------

describe('checkTools', () => {
  it('passes when body has no imperative tool verbs', () => {
    const s = skill({ fm: { tools: ['Read'] }, body: 'analyze the prose' })
    expect(checkTools(s).status).toBe('pass')
  })

  it('flags when body says "write the file" but tools lacks Write', () => {
    const s = skill({
      fm: { tools: ['Read'] },
      body: 'You will write the file to disk.',
    })
    expect(checkTools(s).status).toBe('flag')
  })

  it('passes when body says "write the file" and tools includes Write', () => {
    const s = skill({
      fm: { tools: ['Read', 'Write'] },
      body: 'You will write the file to disk.',
    })
    expect(checkTools(s).status).toBe('pass')
  })

  it('is na for TS commands (no frontmatter tool semantics)', () => {
    const cmd: Surface = {
      name: 'plan',
      kind: 'command',
      path: '/fake/src/commands/cli/plan.ts',
      frontmatter: {},
      body: 'write the file ...',
    }
    expect(checkTools(cmd).status).toBe('na')
  })

  it('is na for hooks', () => {
    const h: Surface = {
      name: 'on-error',
      kind: 'hook',
      path: '/fake/src/hooks/handlers/on-error.ts',
      frontmatter: {},
      body: 'edit the file',
    }
    expect(checkTools(h).status).toBe('na')
  })
})

// ---------------------------------------------------------------------------
// Dimension: invocable
// ---------------------------------------------------------------------------

describe('checkInvocable', () => {
  it('passes a top-level skill that omits user-invocable (canonical entry)', () => {
    const s = skill({
      path: '/fake/skills/universal/code-review.md',
      fm: { name: 'code-review' },
    })
    expect(checkInvocable(s).status).toBe('pass')
  })

  it('flags a helper-path skill that does not declare user-invocable: false', () => {
    const s = skill({
      path: '/fake/skills/universal/rules/some-rule.md',
      fm: {},
    })
    expect(checkInvocable(s).status).toBe('flag')
  })

  it('passes a helper-path skill that declares user-invocable: false', () => {
    const s = skill({
      path: '/fake/skills/universal/rules/some-rule.md',
      fm: { 'user-invocable': false },
    })
    expect(checkInvocable(s).status).toBe('pass')
  })

  it('flags a rule that does not carry user-invocable: false', () => {
    const r: Surface = {
      name: 'tdd-iron-law',
      kind: 'rule',
      path: '/fake/skills/universal/rules/tdd-iron-law.md',
      frontmatter: {},
      body: '',
    }
    expect(checkInvocable(r).status).toBe('flag')
  })

  it('is na for agents', () => {
    expect(checkInvocable(agent({})).status).toBe('na')
  })
})

// ---------------------------------------------------------------------------
// Dimension: oc_visible
// ---------------------------------------------------------------------------

describe('checkOcVisible', () => {
  it('passes a user-invocable skill (default)', () => {
    const s = skill({ fm: {} })
    expect(checkOcVisible(s).status).toBe('pass')
  })

  it('flags a helper that declares user-invocable: false but omits disable-model-invocation', () => {
    const s = skill({
      fm: { 'user-invocable': false },
    })
    expect(checkOcVisible(s).status).toBe('flag')
  })

  it('passes a helper with both flags set', () => {
    const s = skill({
      fm: {
        'user-invocable': false,
        'disable-model-invocation': true,
      },
    })
    expect(checkOcVisible(s).status).toBe('pass')
  })

  it('is na for non-skill surfaces', () => {
    expect(checkOcVisible(agent({})).status).toBe('na')
  })
})

// ---------------------------------------------------------------------------
// Aggregation + isRowFlagged
// ---------------------------------------------------------------------------

describe('auditSurface + aggregation', () => {
  it('returns a row with one entry per dimension', () => {
    // ANV-0212: use a known registry skill so model/effort dimensions pass.
    const row = auditSurface(skill({ name: KNOWN_SKILL }))
    expect(row.surface).toBeTruthy()
    expect(row.templates).toBeDefined()
    expect(row.model).toBeDefined()
    expect(row.effort).toBeDefined()
    expect(row.tools).toBeDefined()
    expect(row.invocable).toBeDefined()
    expect(row.oc_visible).toBeDefined()
  })

  it('model dimension passes for a registered skill and flags for an unknown one', () => {
    const passRow = auditSurface(skill({ name: KNOWN_SKILL }))
    const flagRow = auditSurface(skill({ name: UNKNOWN_SKILL }))
    expect(passRow.model.status).toBe('pass')
    expect(flagRow.model.status).toBe('flag')
  })

  it('isRowFlagged returns true when any dimension is flagged', () => {
    const row: AuditRow = {
      surface: 'x',
      kind: 'skill',
      path: '/x',
      templates: { status: 'pass', note: '' },
      model: { status: 'pass', note: '' },
      effort: { status: 'flag', note: 'bad' },
      tools: { status: 'pass', note: '' },
      invocable: { status: 'pass', note: '' },
      oc_visible: { status: 'pass', note: '' },
    }
    expect(isRowFlagged(row)).toBe(true)
  })

  it('aggregateMatrix tallies counts and flagged per dimension', () => {
    const rows = [
      // KNOWN_SKILL is in registry — model/effort pass; invocable passes (top-level).
      auditSurface(skill({ name: KNOWN_SKILL })),
      // Rules helper — invocable flagged for missing user-invocable:false.
      auditSurface(
        skill({
          name: KNOWN_SKILL,
          path: '/fake/skills/universal/rules/r.md',
          fm: {},
        }),
      ),
    ]
    const m = aggregateMatrix(rows)
    expect(m.counts.skill).toBe(2)
    expect(m.flagged_per_dimension.invocable).toBeGreaterThanOrEqual(1)
  })
})
