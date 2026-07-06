import { describe, expect, it } from 'vitest'
import { loadAllSkills } from '../../src/skills/load-all.js'

/**
 * Phase A6 — Slash-menu surface contract test.
 *
 * Enumerates the full skill registry and asserts that:
 *   1. User-invocable skill count is ≤ 15 (slash menu stays concise).
 *   2. The canonical 12 user-invocable skills are present and visible.
 *   3. Every known utility skill carries user-invocable: false (hidden).
 *   4. All language overlays are hidden (auto-selected by project context,
 *      never invoked directly by the user).
 */

const EXPECTED_USER_INVOCABLE = [
  'learning',
  'debugging',
  'test-driven-development',
  'git-workflow',
  'mcp-construction',
  'ui-design',
  'code-review',
  'orchestration',
  'autonomous-execution',
  'planning',
  'feature-development',
  'development',
]

const KNOWN_HIDDEN = [
  // Universal utilities
  'brainstorming',
  'claude-md-improvement',
  'codebase-mapping',
  'code-simplification',
  'deep-diving',
  'dependency-management',
  'design-system-generation',
  'dispatching-parallel-agents',
  'doc-verification',
  'doc-writing',
  'framework-selection',
  'github-workflow',
  'gitlab-workflow',
  'orchestrator-guide',
  'performance-profiling',
  'plan-verification',
  'plan-writing',
  'project-exploration',
  'research',
  'review-requesting',
  'review-response',
  'security-auditing',
  'silent-failure-discipline',
  'skill-creation',
  'skill-orchestration',
  'skill-selection',
  'slop-removal',
  'subagent-execution',
  'test-analysis',
  'using-git-worktrees',
  'verification',
  // UI sub-skills
  'color-palette-design',
  'style-selection',
  'typography-pairings',
  'ux-reasoning-rules',
  // Rules
  'evidence-before-assertion',
  'one-percent-rule',
  'orchestrator-first',
  'rationalization-prevention',
  'tdd-iron-law',
  'verification-before-completion',
  // Workflows
  'default-feature',
]

describe('slash-menu surface contract', () => {
  it('user-invocable skill count is ≤ 15', async () => {
    const registry = await loadAllSkills({ skillsRoot: 'skills' })
    const visible = registry
      .getAll()
      .filter((s) => s.frontmatter.userInvocable !== false)
    expect(visible.length).toBeLessThanOrEqual(15)
  })

  it('all 12 expected user-invocable skills are present and visible', async () => {
    const registry = await loadAllSkills({ skillsRoot: 'skills' })
    const visibleNames = new Set(
      registry
        .getAll()
        .filter((s) => s.frontmatter.userInvocable !== false)
        .map((s) => s.frontmatter.name),
    )
    for (const name of EXPECTED_USER_INVOCABLE) {
      expect(visibleNames.has(name), `${name} should be user-invocable`).toBe(
        true,
      )
    }
  })

  it('known utility skills carry user-invocable: false', async () => {
    const registry = await loadAllSkills({ skillsRoot: 'skills' })
    const byName = new Map(
      registry.getAll().map((s) => [s.frontmatter.name, s]),
    )
    for (const name of KNOWN_HIDDEN) {
      const skill = byName.get(name)
      if (!skill) continue // skill may not be present in all environments
      expect(
        skill.frontmatter.userInvocable,
        `${name} should have user-invocable: false`,
      ).toBe(false)
    }
  })

  it('all language overlay skills are hidden', async () => {
    const registry = await loadAllSkills({ skillsRoot: 'skills' })
    const langSkills = registry
      .getAll()
      .filter((s) => s.frontmatter.language !== 'universal')
    for (const skill of langSkills) {
      expect(
        skill.frontmatter.userInvocable,
        `language overlay ${skill.frontmatter.name} (${skill.frontmatter.language}) should be hidden`,
      ).toBe(false)
    }
  })
})
