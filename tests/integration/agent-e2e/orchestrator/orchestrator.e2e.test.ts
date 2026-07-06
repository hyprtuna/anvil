/**
 * ANV-0193 — agent-e2e for orchestrator after user-choice pattern rewrite.
 *
 * Behavioral compliance:
 *   1. Agent body is clean of Anvil-specific SDD gates (no ANVIL_SPECS_DIR,
 *      brainstorm-spec, <decisions> block).
 *   2. The ## Spec Hard-Gate section is removed from the agent body.
 *   3. The anvil review --strict-review reference is removed from the agent body.
 *   4. Agent body contains exactly ONE AskUserQuestion JSON payload for the
 *      spec-gate workflow choice.
 *   5. The user-choice prompt has 2 options: Anvil SDD workflow and Generic.
 *   6. The addendum file exists at agents/_addenda/orchestrator-anvil.md and
 *      contains the extracted Anvil-specific gate content.
 *   7. The addendum contains ANVIL_SPECS_DIR, brainstorm-spec, <decisions>,
 *      and anvil review --strict-review.
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

describe('agent-e2e: orchestrator — user-choice pattern', () => {
  // ── 1. Agent body cleanliness ─────────────────────────────────────────────

  it('agent body greps clean for ${ANVIL_SPECS_DIR} token', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).not.toMatch(/\$\{ANVIL_SPECS_DIR\}/)
  })

  it('agent body greps clean for brainstorm-spec references', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).not.toMatch(/brainstorm-spec/)
  })

  it('agent body greps clean for <decisions> block references', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).not.toMatch(/<decisions>/)
  })

  it('agent body greps clean for ## Spec Hard-Gate section heading', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).not.toMatch(/## Spec Hard.Gate/)
  })

  it('agent body greps clean for --require-spec flag references', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).not.toMatch(/--require-spec/)
  })

  it('agent body greps clean for anvil review --strict-review reference', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).not.toMatch(/anvil review --strict-review/)
  })

  // ── 2. User-choice prompt shape ───────────────────────────────────────────

  it('agent body contains exactly one AskUserQuestion JSON payload', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    const payloads = extractAllJsonPayloads(body)
    expect(payloads).toHaveLength(1)
  })

  it('user-choice payload has exactly 2 options', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    const payloads = extractAllJsonPayloads(body)
    expect(payloads).toHaveLength(1)
    const payload = payloads[0]!
    expect(payload.options).toHaveLength(2)
  })

  it('user-choice payload has one Anvil SDD workflow option', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    const anvilOption = payload.options.find((o) =>
      /anvil|sdd|spec.driven/i.test(o.label),
    )
    expect(anvilOption).toBeDefined()
  })

  it('user-choice payload has one Generic option', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    const genericOption = payload.options.find((o) => /generic/i.test(o.label))
    expect(genericOption).toBeDefined()
  })

  it('user-choice payload has a non-empty intro explaining the choice', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    expect(payload.intro).toBeTruthy()
    expect(payload.intro.length).toBeGreaterThan(20)
  })

  it('user-choice payload marks exactly one option as (Recommended)', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    const recommended = payload.options.filter((o) =>
      o.label.includes('(Recommended)'),
    )
    expect(recommended).toHaveLength(1)
  })

  it('each option has a non-empty description explaining the trade-off', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    const payloads = extractAllJsonPayloads(body)
    const payload = payloads[0]!
    for (const opt of payload.options) {
      expect(opt.description).toBeTruthy()
      expect(opt.description.length).toBeGreaterThan(10)
    }
  })

  // ── 3. Addendum exists and contains extracted Anvil content ───────────────

  it('addendum file exists at agents/_addenda/orchestrator-anvil.md', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/orchestrator-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw.length).toBeGreaterThan(100)
  })

  it('addendum contains ANVIL_SPECS_DIR (gate extracted from body)', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/orchestrator-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/ANVIL_SPECS_DIR/)
  })

  it('addendum contains brainstorm-spec reference', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/orchestrator-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/brainstorm-spec/)
  })

  it('addendum contains <decisions> block reference', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/orchestrator-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/<decisions>/)
  })

  it('addendum contains anvil review --strict-review reference', async () => {
    const addendumPath = resolve(AGENTS_ROOT, '_addenda/orchestrator-anvil.md')
    const raw = await readFile(addendumPath, 'utf-8')
    expect(raw).toMatch(/strict-review|strict_review/)
  })

  // ── 4. Behavioral paths ───────────────────────────────────────────────────

  it('Generic flavor: body does not contain SDD gate instructions inline', async () => {
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).not.toMatch(/ANVIL_SPECS_DIR/)
    expect(body).not.toMatch(/brainstorm-spec/)
    expect(body).not.toMatch(/--require-spec/)
  })

  it('ANVIL_BACKGROUND_RESULTS env var reference is preserved in generic body', async () => {
    // This is legitimate env-var for background pool output, not Anvil-specific SDD gate
    const body = await loadAgentBody({ relativePath: 'orchestrator.md' })
    expect(body).toMatch(/ANVIL_BACKGROUND_RESULTS/)
  })
})
