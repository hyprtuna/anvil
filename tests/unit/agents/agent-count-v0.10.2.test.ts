/**
 * Plan 39 Phase G — agent count delta assertion.
 *
 * Reads the agents/ directory at test-time and asserts that exactly 2 new
 * agents were added relative to the v0.10.1 baseline (19 agents).
 *
 * Formula:
 *   baseline = 19   (v0.10.1, pre-Phase-G count)
 *   delta    = 2    (build-error-resolver + assumptions-surfacer)
 *   expected = baseline + delta = 21
 *
 * The count is derived dynamically from the filesystem so this test stays
 * accurate if agents are added or removed in future phases. To update the
 * baseline, change BASELINE_COUNT and document the change inline.
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** v0.10.1 pre-Phase-G agent count. Update when a new baseline is established. */
const BASELINE_COUNT = 19

/**
 * Net delta on top of the v0.10.1 baseline.
 * - Plan 39 Phase G: build-error-resolver, assumptions-surfacer (+2)
 * - Plan 44 Phase E: comment-analyzer (+1)
 * - ANV-0083: assumptions-surfacer, comment-analyzer, type-design-analyzer,
 *             retroactive-validator collapsed into sibling Task(general-purpose)
 *             prompts under their consuming skills (-4).
 *   Net delta: 2 + 1 - 4 = -1.
 */
const NET_DELTA = -1

function countAgentFiles(): number {
  const agentsDir = resolve('agents')
  return readdirSync(agentsDir).filter(
    (f) => f.endsWith('.md') && f !== 'CLAUDE.md' && f !== 'AGENTS.md',
  ).length
}

describe('agents/ directory count (v0.10.2 / Plan 39 Phase G /)', () => {
  it(`has exactly ${BASELINE_COUNT + NET_DELTA} agent .md files (baseline ${BASELINE_COUNT} + net delta ${NET_DELTA})`, () => {
    const actual = countAgentFiles()
    expect(actual).toBe(BASELINE_COUNT + NET_DELTA)
  })

  it('includes build-error-resolver.md', () => {
    const agentsDir = resolve('agents')
    const files = readdirSync(agentsDir)
    expect(files).toContain('build-error-resolver.md')
  })

  // ANV-0083 — assumptions-surfacer collapsed into
  // skills/universal/brainstorm-spec/assumptions-surfacer-prompt.md.
  it('does NOT include assumptions-surfacer.md (collapsed in)', () => {
    const agentsDir = resolve('agents')
    const files = readdirSync(agentsDir)
    expect(files).not.toContain('assumptions-surfacer.md')
  })
})
