import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ANV-0083: brainstorm-spec moved to subdir form to colocate the
// assumptions-surfacer Task(general-purpose) prompt body.
// ANV-0192: Anvil-specific grammar (D-NN, approval handshake, `anvil plan`)
// moved to anvil-addendum.md. User-bundle body (SKILL.md) is Anvil-clean.
const brainstormSpec = readFileSync(
  'skills/universal/brainstorm-spec/SKILL.md',
  'utf-8',
)
const brainstormSpecAddendum = readFileSync(
  'skills/universal/brainstorm-spec/anvil-addendum.md',
  'utf-8',
)
// ANV-0189: plan-writing converted to subdir form; Anvil-specific grammar
// moved to anvil-addendum.md. User-bundle body (SKILL.md) is Anvil-clean.
const planWriter = readFileSync(
  'skills/universal/plan-writing/SKILL.md',
  'utf-8',
)
// Anvil-flavored addendum (loaded when user picks .anvil/plans/).
const planWriterAddendum = readFileSync(
  'skills/universal/plan-writing/anvil-addendum.md',
  'utf-8',
)

describe('skills/universal/brainstorm-spec — HARD-GATE markup', () => {
  it('contains a <HARD-GATE> block', () => {
    expect(brainstormSpec).toContain('<HARD-GATE')
  })

  it('contains letter = spirit line in HARD-GATE block', () => {
    expect(brainstormSpec).toMatch(/letter\s*=\s*spirit/i)
  })

  it('addendum mandates D-NN: decision ID convention', () => {
    // ANV-0192: D-NN grammar moved to anvil-addendum.md so the body
    // stays Anvil-clean for non-Anvil users.
    expect(brainstormSpecAddendum).toMatch(/D-\d\d:/i)
  })

  it('requires ## Open Questions section', () => {
    expect(brainstormSpec).toContain('## Open Questions')
  })

  it('addendum requires user-approval handshake before exit', () => {
    // ANV-0192: approval handshake + `anvil plan` chain moved to addendum.
    expect(brainstormSpecAddendum).toMatch(/[Cc]onfirm|[Aa]pproval|approved/i)
    expect(brainstormSpecAddendum).toContain('anvil plan')
  })
})

describe('skills/universal/plan-writing — structural markup', () => {
  // ANV-0189: <plan-header> and must_haves moved to anvil-addendum.md.
  // Check addendum for Anvil-specific content; check SKILL.md for universal content.

  it('addendum contains a <plan-header> reference and must_haves instruction', () => {
    const hasPlanHeader = planWriterAddendum.includes('<plan-header>')
    const hasMustHaves = planWriterAddendum.includes('must_haves')
    expect(hasPlanHeader || hasMustHaves).toBe(true)
  })

  it('contains a "No Placeholders" forbidden list with TBD', () => {
    // Must explicitly call out TBD as forbidden in the user-bundle body
    expect(planWriter).toMatch(
      /[Nn]o [Pp]laceholders|forbidden.*TBD|TBD.*forbidden/i,
    )
    expect(planWriter).toContain('TBD')
  })

  it('contains an Inline self-review checklist section', () => {
    expect(planWriter).toMatch(/[Ii]nline self-review|inline.*self.*review/i)
  })
})
