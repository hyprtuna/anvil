/**
 * ANV-0211 — Skill Model Registry
 *
 * `BUNDLED_SKILL_REGISTRY` is the compile-time-seeded source of truth for
 * default model assignments to bundled skills. Seeded from defaults.ts
 * (groups / overrides) and reconciled against skill frontmatter
 * (preferred_model / preferred_effort). See conflict policy D-60.
 *
 * The registry is runtime-extensible via:
 *   `registerSkillModel(name, entry)` — used by extension installs + tests
 *
 * Conflict policy D-60 (ANV-0251):
 *   defaults.ts is the resolver's source of truth. The registry reflects what
 *   the resolver ACTUALLY produces, not what frontmatter declares.
 *   Mismatches between frontmatter preferred_model/preferred_effort and what
 *   defaults.ts resolves cause the D-60 conflict detection test to fail at
 *   build time, forcing human resolution.
 *
 * Drift reconciliation (ANV-0211):
 *   All 5 previously documented drifts have been reconciled by adding the
 *   missing skill names to the appropriate defaults.ts groups.members[] arrays.
 *   See defaults.ts ANV-0211 comments for per-skill rationale.
 *
 *   1. brainstorm-spec → added to planning group (opus/high)
 *   2. code-review     → added to review group (opus/high)
 *   3. plan-verification → added to review group (opus/high)
 *   4. using-anvil     → added to meta group (sonnet/medium);
 *                        frontmatter effort=low vs group effort=medium; resolver wins (medium)
 *   5. default-feature → workflow group created in defaults.ts (sonnet/high)
 *      using-git-worktrees also placed in workflow group
 *
 * security-auditing:
 *   Is a SKILL (skills/universal/security-auditing.md), NOT an agent.
 *   Moved from BUNDLED_AGENT_REGISTRY to this registry in ANV-0211.
 *   Resolver: overrides['security-auditing'] = opus/max.
 *
 * Consumer note:
 *   `resolveSkillAssignment(name)` is the public read API.
 *   Resolver wiring (adding a registry layer to resolveModel) is ANV-0212's job.
 *   Do NOT call this from src/core/models/resolve.ts in this ticket.
 */

import type { ModelAssignment, RegistryEntry } from './model-registry-types.js'

// ─── Bundled registry (seeded from defaults.ts, matching resolver output) ────
//
// Entry format: { role, intensity, model, effort }
//   role      → which preset-matrix row (small/coding/review/planning/autonomous)
//   intensity → how much to spend (low/standard/deep/max)
//   model     → concrete resolver output alias (opus/sonnet/haiku)
//   effort    → concrete resolver output effort level
//
// All entries verified to match `resolveModel(name, buildDefaultConfig(), {})` output.
// See tests/integration/d60-conflict-detection.test.ts which asserts this at build time.
//
// Group membership (from defaults.ts post-ANV-0211 reconciliation):
//   planning group (opus/high): plan-writing, brainstorming, brainstorm-spec,
//     codebase-mapping, project-exploration, deep-diving, skill-selection,
//     orchestrator-guide, research, orchestration, framework-selection, planning
//   review group (opus/high): code-review, code-reviewer-skill, plan-verification,
//     silent-failure-discipline, test-analysis, code-simplification, doc-verification,
//     security-auditing*, performance-profiling, dependency-management, verification,
//     review-requesting, review-response, slop-removal, two-stage-review,
//     php-review, claude-md-improvement
//   development group (sonnet/medium): development, feature-development, ui-design,
//     test-driven-development, javascript-coding, typescript-coding, php-coding,
//     python-coding, go-coding, rust-coding, java-coding, kotlin-coding, ruby-coding,
//     mcp-construction, + many language skills
//   testing group (sonnet/medium): javascript-testing, php-testing, python-testing,
//     go-testing, rust-testing
//   automation group (haiku/low): git-workflow, github-workflow, gitlab-workflow,
//     doc-writing
//   autonomous group (opus/max): ultra-worker (agent, not in skill registry)
//   meta group (sonnet/medium): skill-creation, learning, debugging, using-anvil
//   cost-optimised group (haiku/low): summarization
//   workflow group (sonnet/high): default-feature, using-git-worktrees
//   override (overrides: skill-selection=haiku/low, security-auditing=opus/max)
//
// * security-auditing: in review group members AND in overrides (opus/max) — override wins
export const BUNDLED_SKILL_REGISTRY: Readonly<Record<string, ModelAssignment>> =
  Object.freeze({
    // ─────────────────────────────────────────────────────────────────────────
    // planning group → opus/high
    // ─────────────────────────────────────────────────────────────────────────
    'plan-writing': {
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    brainstorming: {
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'brainstorm-spec': {
      // ANV-0211: reconciled — added to planning group. Resolver: opus/high (was sonnet/medium).
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'sdd-workflow': {
      // ANV-0249: composite SDD skill (parallel to TDD), planning group member.
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'codebase-mapping': {
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'project-exploration': {
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'deep-diving': {
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'orchestrator-guide': {
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    research: {
      // ANV-0211: added to planning group. Resolver: opus/high.
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    orchestration: {
      // ANV-0211: added to planning group. Resolver: opus/high.
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'framework-selection': {
      // ANV-0211: added to planning group. Resolver: opus/high.
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    planning: {
      role: 'planning',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    // skill-selection: in planning group members BUT overridden to haiku via overrides.
    // Haiku does not accept effort — effort is dropped by the resolver.
    'skill-selection': {
      // Override wins over group: overrides['skill-selection'] = haiku
      role: 'small',
      intensity: 'low',
      model: 'haiku',
      // effort intentionally absent — Haiku drops effort (same as quick-tier agents)
    },

    // ─────────────────────────────────────────────────────────────────────────
    // review group → opus/high
    // ─────────────────────────────────────────────────────────────────────────
    'code-review': {
      // ANV-0211: reconciled — added to review group. Resolver: opus/high (was sonnet/medium).
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'plan-verification': {
      // ANV-0211: reconciled — added to review group. Resolver: opus/high (was sonnet/medium).
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'silent-failure-discipline': {
      // ANV-0211: added to review group. Resolver: opus/high.
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'test-analysis': {
      // ANV-0211: added to review group. Resolver: opus/high.
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'code-simplification': {
      // ANV-0211: added to review group. Resolver: opus/high.
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'doc-verification': {
      // NOTE: frontmatter name is 'doc-verification'; defaults.ts review group has 'doc-verifier' (agent).
      // Frontmatter group=review but 'doc-verification' is not in review members. Falls to default.
      // This is a known mismatch documented here — skill is doc-verification, agent is doc-verifier.
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    // security-auditing: ANV-0211 moved from BUNDLED_AGENT_REGISTRY to here (it's a skill).
    // Override wins over review group: overrides['security-auditing'] = opus/max
    'security-auditing': {
      role: 'autonomous',
      intensity: 'max',
      model: 'opus',
      effort: 'max',
    },
    'performance-profiling': {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'dependency-management': {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    verification: {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'review-requesting': {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'review-response': {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    'slop-removal': {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    // two-stage-review: ANV-0211 added to review group. Resolver: opus/high.
    'two-stage-review': {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    // php-review: ANV-0211 added to review group. Resolver: opus/high.
    'php-review': {
      role: 'review',
      intensity: 'standard',
      model: 'opus',
      effort: 'high',
    },
    // claude-md-improvement: ANV-0211 added to meta group. Resolver: sonnet/medium.
    'claude-md-improvement': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },

    // ─────────────────────────────────────────────────────────────────────────
    // development group → sonnet/medium
    // ─────────────────────────────────────────────────────────────────────────
    development: {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'feature-development': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'ui-design': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'test-driven-development': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'javascript-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'typescript-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'php-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'python-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'go-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'rust-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'java-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'kotlin-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'ruby-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'mcp-construction': {
      // NOTE: frontmatter name is 'mcp-construction'; defaults.ts development group has 'mcp-builder' (agent).
      // 'mcp-construction' skill is NOT in development group members (mcp-builder is) → falls to default.
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    // Additional development-class skills (frontmatter group=development but not in group members)
    'design-system-generation': {
      // frontmatter: group=development, preferred_model=sonnet, preferred_effort=high
      // 'design-system-generation' not in development members → falls to default (sonnet/medium).
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'finishing-branch': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    // subagent-execution: frontmatter group=development, preferred_model=opus.
    // 'subagent-execution' not in development members (subagent-executor agent is) → falls to default.
    'subagent-execution': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    // Other language skills not in development members
    'cpp-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'csharp-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'django-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'fastapi-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'laravel-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'nextjs-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'rails-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'react-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'spring-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'swift-coding': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'typescript-typing': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    // ui sub-skills (frontmatter group=development/rules, not in members)
    // ANV-0211 Gate-1 round-2: ui-anti-pattern-rules and ux-reasoning-rules declare
    // preferred_model:sonnet but were absent from registry. Neither is in any group members
    // list → resolver falls to default (sonnet/medium).
    'ui-anti-pattern-rules': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'ux-reasoning-rules': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'color-palette-design': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'style-selection': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'typography-pairings': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },

    // ─────────────────────────────────────────────────────────────────────────
    // testing group → sonnet/medium
    // ─────────────────────────────────────────────────────────────────────────
    'javascript-testing': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'php-testing': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'python-testing': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'go-testing': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'rust-testing': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },

    // ─────────────────────────────────────────────────────────────────────────
    // automation group → haiku/low
    // ─────────────────────────────────────────────────────────────────────────
    'git-workflow': {
      role: 'small',
      intensity: 'low',
      model: 'haiku',
      // effort intentionally absent — Haiku drops effort
    },
    'github-workflow': {
      role: 'small',
      intensity: 'low',
      model: 'haiku',
      // effort intentionally absent — Haiku drops effort
    },
    'gitlab-workflow': {
      role: 'small',
      intensity: 'low',
      model: 'haiku',
      // effort intentionally absent — Haiku drops effort
    },
    'doc-writing': {
      role: 'small',
      intensity: 'low',
      model: 'haiku',
      // effort intentionally absent — Haiku drops effort
    },

    // ─────────────────────────────────────────────────────────────────────────
    // meta group → sonnet/medium
    // ─────────────────────────────────────────────────────────────────────────
    'skill-creation': {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    learning: {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    debugging: {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'using-anvil': {
      // ANV-0211: reconciled — added to meta group. Resolver: sonnet/medium.
      // frontmatter effort=low vs group effort=medium; resolver (medium) wins.
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },

    // ─────────────────────────────────────────────────────────────────────────
    // cost-optimised group → haiku/low
    // ─────────────────────────────────────────────────────────────────────────
    summarization: {
      role: 'small',
      intensity: 'low',
      model: 'haiku',
      // effort intentionally absent — Haiku drops effort
    },

    // ─────────────────────────────────────────────────────────────────────────
    // workflow group → sonnet/high (ANV-0211: new group added to defaults.ts)
    // ─────────────────────────────────────────────────────────────────────────
    'default-feature': {
      // ANV-0211: workflow group created, skill added. Resolver: sonnet/high.
      // Previously: no workflow group → falls to default (sonnet/medium); drift with frontmatter effort=high.
      role: 'coding',
      intensity: 'deep',
      model: 'sonnet',
      effort: 'high',
    },
    'using-git-worktrees': {
      // ANV-0211: added to workflow group. Resolver: sonnet/high.
      // Previously: fell to default (sonnet/medium); drift with frontmatter effort=medium (now updated to high).
      role: 'coding',
      intensity: 'deep',
      model: 'sonnet',
      effort: 'high',
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Default group → sonnet/medium
    // Skills below are NOT in any group members list; resolver falls to default.
    // ─────────────────────────────────────────────────────────────────────────
    'architecture-decision-record': {
      // frontmatter: group=documentation (no such group in defaults.ts) → default
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'changelog-generation': {
      // frontmatter: group=documentation → default
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'codebase-onboarding': {
      // frontmatter: group=exploration (no such group) → default
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'code-tour': {
      // frontmatter: group=exploration → default
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'dispatching-parallel-agents': {
      // frontmatter: group=orchestration (no such group) → default
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'read-background-results': {
      // frontmatter: group=orchestration → default
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'skill-orchestration': {
      // frontmatter: group=orchestration → default
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
    },
    'autonomous-execution': {
      // ANV-0211: added to autonomous group. Resolver: opus/max.
      role: 'autonomous',
      intensity: 'max',
      model: 'opus',
      effort: 'max',
    },
  })

// ─── Runtime extension layer ─────────────────────────────────────────────────

const _extensionRegistry = new Map<string, RegistryEntry>()
const _userOverrides = new Map<string, RegistryEntry>()

/**
 * Register a skill model assignment at runtime.
 * Intended for use by:
 *   - Extension install pipeline (src/installer/extensions/install-pipeline.ts)
 *   - Tests that need to inject custom assignments
 *
 * A subsequent call with the same name overwrites the previous entry.
 */
export function registerSkillModel(name: string, entry: RegistryEntry): void {
  _extensionRegistry.set(name, entry)
}

/**
 * Register multiple skill model assignments at once (batch extension registration).
 * Each entry in `records` is passed to `registerSkillModel`.
 */
export function registerExtensionSkillAssignments(
  records: Record<string, RegistryEntry>,
): void {
  for (const [name, entry] of Object.entries(records)) {
    registerSkillModel(name, entry)
  }
}

/**
 * Apply user overrides from anvil.toml `skill_assignments:` block.
 * User overrides sit above extension registrations.
 * Called from src/core/config/load.ts when anvil.toml is parsed.
 */
export function setSkillUserOverrides(
  records: Record<string, RegistryEntry>,
): void {
  _userOverrides.clear()
  for (const [name, entry] of Object.entries(records)) {
    _userOverrides.set(name, entry)
  }
}

/**
 * Resolve a skill's ModelAssignment.
 * Precedence (highest first): user overrides → extensions → bundled.
 * Returns `undefined` if the skill is not registered anywhere.
 *
 * NOTE: The resolver (resolveModel in resolve.ts) does NOT yet call this.
 * Wiring is ANV-0212's job. This API exists so consumers can migrate.
 */
export function resolveSkillAssignment(
  name: string,
): ModelAssignment | undefined {
  return (
    _userOverrides.get(name) ??
    _extensionRegistry.get(name) ??
    BUNDLED_SKILL_REGISTRY[name]
  )
}

/**
 * Returns a snapshot of all registered skill names across all layers.
 * Useful for doctor checks and tests.
 */
export function allRegisteredSkillNames(): string[] {
  const names = new Set<string>([
    ...Object.keys(BUNDLED_SKILL_REGISTRY),
    ..._extensionRegistry.keys(),
    ..._userOverrides.keys(),
  ])
  return [...names]
}

/**
 * Reset runtime registrations (extensions + user overrides).
 * FOR TESTING ONLY — do not call in production code.
 */
export function _resetSkillRegistryForTest(): void {
  _extensionRegistry.clear()
  _userOverrides.clear()
}
