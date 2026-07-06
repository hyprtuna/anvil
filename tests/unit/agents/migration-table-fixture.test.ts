/**
 * Plan 38 Phase E — Migration table fixture test.
 *
 * Encodes the 19-row migration table as a literal fixture. Any future tier
 * change MUST update this fixture explicitly — it is a regression guard.
 *
 * The fixture asserts:
 *   1. Agent file has `tier:` set to the expected tier name.
 *   2. Agent file does NOT have `model:` (or only has 'inherit').
 *   3. The resolved {model, effort} from buildDefaultConfig() matches the table.
 *   4. Agent is present in config.agents block with the expected tier.
 *
 * This is a unit test because it reads from the agents/ directory on disk
 * (file path relative to cwd, consistent with other agent unit tests) and
 * from the defaults config — no spawned processes, no network.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { resolveModel } from '../../../src/core/models/resolve.js'

/**
 * The canonical migration table.  Update this when changing any agent tier.
 *
 * History:
 * - Phase E (19 rows): full sweep of shipped agents pinned to canonical tiers.
 * - ANV-0083 (17 rows): retroactive-validator and type-design-analyzer
 *   collapsed into sibling Task(general-purpose) prompts under their consuming
 *   skills.  Their tier entries were removed from `defaults.ts → agents:`.
 */
const MIGRATION_TABLE = [
  {
    file: 'code-architect',
    tier: 'planning',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'high' as string | undefined,
    },
    notes: 'Architecture proposals; tier provides Opus + high.',
  },
  {
    file: 'code-explorer',
    tier: 'quick',
    expected: {
      model: 'claude-haiku-4-5',
      effort: undefined as string | undefined,
    },
    notes:
      'Read-only exploration; Haiku clamped — no effort sent (research §A1).',
  },
  {
    file: 'code-quality-reviewer',
    tier: 'review',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'high' as string | undefined,
    },
    notes:
      'Sonnet+high sufficient (research §B2); intentional downgrade from Opus.',
  },
  {
    file: 'code-reviewer',
    tier: 'review',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'high' as string | undefined,
    },
    notes: 'Two-stage review; Sonnet+high.',
  },
  {
    file: 'code-simplifier',
    tier: 'review',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'high' as string | undefined,
    },
    notes: 'Stays Sonnet; effort bumped from default medium to high via tier.',
  },
  {
    file: 'doc-verifier',
    tier: 'review',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'high' as string | undefined,
    },
    notes: 'Stays Sonnet; same bump as code-simplifier.',
  },
  {
    file: 'framework-selector',
    tier: 'planning',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'high' as string | undefined,
    },
    notes: 'Structured tradeoff analysis warrants Opus.',
  },
  {
    file: 'mcp-builder',
    tier: 'coding',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'medium' as string | undefined,
    },
    notes: 'Scaffold + implement; Sonnet+medium sufficient.',
  },
  {
    file: 'orchestrator',
    tier: 'planning',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'high' as string | undefined,
    },
    notes: 'Decomposition + synthesis; agent_mode:primary retained.',
  },
  {
    file: 'plan-verifier',
    tier: 'planning',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'high' as string | undefined,
    },
    notes: 'Plan-level reasoning.',
  },
  {
    file: 'researcher',
    tier: 'planning',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'high' as string | undefined,
    },
    notes:
      'Already migrated in Phase B (tier:standard → tier:planning per research §F1). Verified here.',
  },
  // ANV-0083: retroactive-validator collapsed → consumed by plan-verification skill.
  {
    file: 'silent-failure-hunter',
    tier: 'ultra',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'xhigh' as string | undefined,
    },
    notes: 'Exhaustive audit warrants xhigh effort.',
  },
  {
    file: 'spec-reviewer',
    tier: 'review',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'high' as string | undefined,
    },
    notes: 'Spec compliance.',
  },
  {
    file: 'strict-reviewer',
    tier: 'planning',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'high' as string | undefined,
    },
    notes: 'Adversarial high-stakes.',
  },
  {
    file: 'subagent-executor',
    tier: 'coding',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'medium' as string | undefined,
    },
    notes: 'Implementation orchestration.',
  },
  {
    file: 'test-analyzer',
    tier: 'review',
    expected: {
      model: 'claude-sonnet-4-6',
      effort: 'high' as string | undefined,
    },
    notes: 'Test gap analysis.',
  },
  // ANV-0083: type-design-analyzer collapsed → consumed by code-review skill.
  {
    file: 'ultra-worker',
    tier: 'ultra',
    expected: {
      model: 'claude-opus-4-7',
      effort: 'xhigh' as string | undefined,
    },
    notes:
      "User's explicit request — autonomous gets max-effort Opus (research §B2 ultra row).",
  },
] as const

describe('Phase E / migration table fixture (17 rows)', () => {
  it('fixture contains exactly 17 rows (Phase E 19 minus collapsed 2)', () => {
    expect(MIGRATION_TABLE).toHaveLength(17)
  })

  const config = buildDefaultConfig()

  for (const row of MIGRATION_TABLE) {
    const { file, tier, expected, notes } = row

    describe(`${file}.md [tier: ${tier}]`, () => {
      const agentPath = join(process.cwd(), 'agents', `${file}.md`)

      it(`frontmatter has tier: ${tier}`, () => {
        const raw = readFileSync(agentPath, 'utf-8')
        const parsed = matter(raw)
        const data = parsed.data as Record<string, unknown>
        // ANV-0206: tier may be at root (pre-migration) or under x-anvil (post-migration)
        const xAnvil = data['x-anvil'] as Record<string, unknown> | undefined
        const effectiveTier = data.tier ?? xAnvil?.tier
        expect(
          effectiveTier,
          `${file}.md — expected tier:${tier}, got ${String(effectiveTier)}. Notes: ${notes}`,
        ).toBe(tier)
      })

      it('frontmatter does not have model: (or only inherit)', () => {
        const raw = readFileSync(agentPath, 'utf-8')
        const parsed = matter(raw)
        const data = parsed.data as Record<string, unknown>
        const model = data.model
        if (model !== undefined) {
          expect(
            model,
            `${file}.md must not declare model: in frontmatter after Phase E migration`,
          ).toBe('inherit')
        }
      })

      it(`config.agents has entry { tier: '${tier}' }`, () => {
        const agentEntry = config.agents?.[file]
        expect(agentEntry, `config.agents must contain '${file}'`).toBeDefined()
        expect(agentEntry?.tier).toBe(tier)
      })

      it(`resolveModel returns model: ${expected.model}`, () => {
        const resolution = resolveModel(file, config)
        expect(resolution.model).toBe(expected.model)
      })

      it(`resolveModel returns effort: ${String(expected.effort)}`, () => {
        const resolution = resolveModel(file, config)
        expect(resolution.effort).toBe(expected.effort)
      })
    })
  }
})
