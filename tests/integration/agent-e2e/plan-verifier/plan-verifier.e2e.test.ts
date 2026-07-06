/**
 * ANV-0194 — agent-e2e for plan-verifier after SDD gate extraction.
 *
 * Behavioral compliance:
 *   1. Agent body is clean of SDD-specific gate tokens: no `covered_decisions:`,
 *      no `workflow.decision_coverage`, no `<decisions>` block parsing, no
 *      `## Open Questions` spec references, no `docs/anvil/plans/` example paths.
 *   2. Agent body contains exactly ONE AskUserQuestion JSON payload for the
 *      verification mode choice.
 *   3. The user-choice prompt has 2 options:
 *        - SDD spec-driven (plan has covered_decisions + spec.md)
 *        - Generic plan-vs-goal (any plan format — no SDD requirement)
 *   4. Generic path: body describes goal-backward plan-vs-goal analysis without
 *      firing SDD gates.
 *   5. Addendum file exists at agents/_addenda/plan-verifier-anvil.md and
 *      contains the extracted Gate 1/2 SDD logic.
 *   6. Addendum contains `covered_decisions`, `<decisions>`, `## Open Questions`
 *      — confirming the SDD extraction was complete.
 *   7. Edge: addendum describes spec.md-not-found handling ("spec.md not found").
 *   8. Edge: generic body describes "plan has no stated goal" reporting
 *      (empty plan edge case handled without SDD error).
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAgentBody } from '../load-agent.js'

const AGENTS_ROOT = resolve(process.cwd(), 'agents')

interface AskUserQuestionPayload {
  question: string
  intro: string
  options: Array<{ label: string; description: string }>
  _rationale?: string
}

function extractAllJsonPayloads(text: string): AskUserQuestionPayload[] {
  const results: AskUserQuestionPayload[] = []
  const re = /```json\s*([\s\S]*?)\s*```/g
  for (let match = re.exec(text); match !== null; match = re.exec(text)) {
    try {
      results.push(JSON.parse(match[1]) as AskUserQuestionPayload)
    } catch {
      // skip malformed blocks
    }
  }
  return results
}

describe('agent-e2e: plan-verifier — SDD gate extraction', () => {
  // ── 1. Agent body cleanliness — SDD tokens must be gone ──────────────────

  it('agent body greps clean for covered_decisions: frontmatter key', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).not.toMatch(/covered_decisions/)
  })

  it('agent body greps clean for workflow.decision_coverage references', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).not.toMatch(/workflow\.decision_coverage/)
  })

  it('agent body greps clean for <decisions> block parsing instructions', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).not.toMatch(/<decisions>/)
  })

  it('agent body greps clean for ## Open Questions spec-parsing instructions', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    // Must not instruct agent to parse spec.md's ## Open Questions section
    expect(body).not.toMatch(
      /Parse spec\.md.*Open Questions|Open Questions.*spec\.md/i,
    )
  })

  it('agent body greps clean for workflow.research_gate references', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).not.toMatch(/workflow\.research_gate/)
  })

  it('agent body greps clean for docs/anvil/plans/ example paths', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).not.toMatch(/docs\/anvil\/plans\//)
  })

  it('agent body greps clean for docs/anvil/specs/ example paths', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).not.toMatch(/docs\/anvil\/specs\//)
  })

  // ── 2. User-choice prompt shape ───────────────────────────────────────────

  it('agent body contains exactly one AskUserQuestion JSON payload', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    const payloads = extractAllJsonPayloads(body)
    expect(payloads).toHaveLength(1)
  })

  it('user-choice payload has exactly 2 options', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    const payloads = extractAllJsonPayloads(body)
    expect(payloads).toHaveLength(1)
    const payload = payloads[0]!
    expect(payload.options).toHaveLength(2)
  })

  it('user-choice payload has one SDD spec-driven option', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    const sddOption = payload.options.find((o) =>
      /sdd|spec.driven|spec-driven|decision/i.test(o.label),
    )
    expect(sddOption).toBeDefined()
  })

  it('user-choice payload has one Generic plan-vs-goal option', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    const genericOption = payload.options.find((o) =>
      /generic|plan.vs.goal|goal/i.test(o.label),
    )
    expect(genericOption).toBeDefined()
  })

  it('user-choice payload has a non-empty intro explaining the choice', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    expect(payload.intro).toBeTruthy()
    expect(payload.intro.length).toBeGreaterThan(20)
  })

  it('user-choice payload marks exactly one option as (Recommended)', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    const recommended = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
  })

  it('each option has a non-empty description explaining the trade-off', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    for (const opt of payload.options) {
      expect(opt.description).toBeTruthy()
      expect(opt.description.length).toBeGreaterThan(10)
    }
  })

  // ── 3. Generic flavor — plan-vs-goal analysis documented ─────────────────

  it('Generic flavor: body describes plan-vs-goal or goal-backward verification', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).toMatch(
      /goal.backward|plan.vs.goal|stated goal|goal.*requirements/i,
    )
  })

  it('Generic flavor: body documents how to handle empty/missing plan goal', async () => {
    // The "no stated goal" edge case must be handled in the generic path
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).toMatch(
      /no stated goal|missing.*goal|goal.*missing|goal.*absent|unmeasurable goal/i,
    )
  })

  // ── 4. Addendum exists and contains extracted Gate 1/2 SDD content ────────

  it('addendum file exists at agents/_addenda/plan-verifier-anvil.md', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/plan-verifier-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw.length).toBeGreaterThan(100)
  })

  it('addendum contains covered_decisions: (Gate 1 SDD logic extracted)', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/plan-verifier-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/covered_decisions/)
  })

  it('addendum contains <decisions> block parsing instructions', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/plan-verifier-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/<decisions>/)
  })

  it('addendum contains ## Open Questions gate (Gate 2 SDD logic)', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/plan-verifier-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/Open Questions/)
  })

  it('addendum contains workflow.decision_coverage reference', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/plan-verifier-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/workflow\.decision_coverage|decision_coverage/)
  })

  it('addendum contains workflow.research_gate reference', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/plan-verifier-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/workflow\.research_gate|research_gate/)
  })

  // ── 5. Edge cases ─────────────────────────────────────────────────────────

  it('addendum describes spec.md-not-found handling', async () => {
    // Edge: SDD flavor with missing spec.md should report cleanly
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/plan-verifier-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(
      /spec\.md not found|spec not found|missing.*spec|spec.*missing/i,
    )
  })

  // ── 6. SDD flavor wiring — agent body references addendum ────────────────

  it('agent body references the plan-verifier-anvil.md addendum for SDD path', async () => {
    const body = await loadAgentBody({ relativePath: 'plan-verifier.md' })
    expect(body).toMatch(/plan-verifier-anvil\.md/)
  })
})
