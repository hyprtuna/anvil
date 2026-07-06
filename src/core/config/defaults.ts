import type { ModelsConfig } from '../types.js'

// Defaults use Anvil's built-in short aliases (`opus`/`sonnet`/`haiku`) which
// the resolver expands via `BUILTIN_MODEL_ALIASES` in src/core/models/aliases.ts.
// Single point of update when a provider ships a new version. Users on
// non-Anthropic providers (Kimi, GLM, GPT, etc.) override the short names by
// populating `model_aliases` in their own models.json — the resolver consults
// user aliases before built-ins.
const OPUS = 'opus'
const SONNET = 'sonnet'
const HAIKU = 'haiku'

export function buildDefaultConfig(): ModelsConfig {
  return {
    $schema: 'https://anvil.dev/schemas/models.json',
    version: '1.0',
    defaults: {
      model: SONNET,
      effort: 'medium',
      fallback_model: HAIKU,
      fallback_chain: [SONNET, HAIKU],
      max_tokens: 8192,
    },
    groups: {
      planning: {
        model: OPUS,
        effort: 'high',
        fallback_chain: [],
        description: 'Deep reasoning: architecture, breakdown, risk analysis',
        members: [
          'planning',
          'plan-writing',
          'brainstorming',
          'brainstorm-spec', // ANV-0211: reconcile drift — frontmatter says group=planning, skill was absent from members
          'codebase-mapping',
          'project-exploration',
          'deep-diving',
          'skill-selection',
          'orchestrator',
          'orchestrator-guide',
          'researcher',
          'framework-selector',
          'research', // ANV-0211: frontmatter says group=planning, skill was absent from members
          'orchestration', // ANV-0211: frontmatter says group=planning, skill was absent from members
          'framework-selection', // ANV-0211: frontmatter says group=planning, skill was absent from members
          'sdd-workflow', // ANV-0249: composite SDD skill (parallel to TDD), planning-heavy work
        ],
      },
      development: {
        model: SONNET,
        effort: 'medium',
        fallback_chain: [],
        description: 'General coding, feature work, refactoring',
        members: [
          'development',
          'feature-development',
          'ui-design',
          'subagent-executor',
          'test-driven-development',
          'javascript-coding',
          'typescript-coding',
          'php-coding',
          'python-coding',
          'go-coding',
          'rust-coding',
          'java-coding',
          'kotlin-coding',
          'ruby-coding',
          'mcp-builder',
        ],
      },
      review: {
        model: OPUS,
        effort: 'high',
        fallback_chain: [],
        description: 'Code review, security audit, quality gate',
        members: [
          'code-review', // ANV-0211: reconcile drift — frontmatter says group=review, skill was absent from members
          'code-reviewer',
          'plan-verification', // ANV-0211: reconcile drift — frontmatter says group=review, skill was absent from members
          'plan-verifier',
          'silent-failure-hunter',
          'test-analyzer',
          'code-simplifier',
          'doc-verifier',
          'security-auditing',
          'performance-profiling',
          'dependency-management',
          'verification',
          'review-requesting',
          'review-response',
          'slop-removal',
          'silent-failure-discipline', // ANV-0211: frontmatter says group=review, skill was absent from members
          'test-analysis', // ANV-0211: frontmatter says group=review, skill was absent from members
          'code-simplification', // ANV-0211: frontmatter says group=review, skill was absent from members
          'two-stage-review', // ANV-0211: frontmatter says group=review, skill was absent from members
          'php-review', // ANV-0211: frontmatter says group=review, skill was absent from members
        ],
      },
      testing: {
        model: SONNET,
        effort: 'medium',
        fallback_chain: [],
        description: 'Test generation, coverage analysis, test running',
        members: [
          'javascript-testing',
          'php-testing',
          'python-testing',
          'go-testing',
          'rust-testing',
        ],
      },
      automation: {
        model: HAIKU,
        effort: 'low',
        fallback_chain: [],
        description:
          'Fast repetitive tasks: hooks, formatting, commit messages',
        members: [
          'git-workflow',
          'github-workflow',
          'gitlab-workflow',
          'doc-writing',
        ],
      },
      autonomous: {
        model: OPUS,
        effort: 'max',
        fallback_chain: [],
        description: 'Long-running autonomous agents with full task authority',
        members: [
          'ultra-worker',
          'autonomous-execution', // ANV-0211: frontmatter says group=autonomous, skill was absent from members
        ],
      },
      meta: {
        model: SONNET,
        effort: 'medium',
        fallback_chain: [],
        description: 'Skill system maintenance and self-improvement',
        members: [
          'skill-creation',
          'learning',
          'debugging',
          'using-anvil', // ANV-0211: reconcile drift — frontmatter says group=meta, skill was absent from members
          // Note: frontmatter preferred_effort=low but meta group effort=medium; resolver (medium) wins.
          'claude-md-improvement', // ANV-0211: frontmatter says group=meta, skill was absent from members
        ],
      },
      // ANV-0211: workflow group — 'default-feature' and 'using-git-worktrees' frontmatter declare group=workflow.
      // Created here to reconcile the drift (resolver was falling to default/sonnet/medium instead of workflow/sonnet/high).
      workflow: {
        model: SONNET,
        effort: 'high',
        fallback_chain: [],
        description:
          'Workflow skills: guided feature development, git worktrees, branching strategies',
        members: [
          'default-feature', // ANV-0211: reconcile drift — frontmatter says group=workflow, group did not exist
          'using-git-worktrees', // ANV-0211: frontmatter says group=workflow
        ],
      },
      // Plan 32 C4 — utility skills that should always run on the cheapest
      // available model. Haiku is fast and accurate enough for summarisation
      // and other lightweight transformations.
      'cost-optimised': {
        model: HAIKU,
        effort: 'low',
        fallback_chain: [],
        description:
          'Utility/transformation skills that run on Haiku to keep token cost minimal',
        members: ['summarization'],
      },
    },
    overrides: {
      'ultra-worker': {
        model: OPUS,
        effort: 'max',
        fallback_chain: [],
        max_tokens: 32768,
        note: 'Autonomous agent needs full context',
      },
      'skill-selection': {
        model: HAIKU,
        effort: 'low',
        fallback_chain: [],
        note: 'Lightweight routing, not deep reasoning',
      },
      'security-auditing': {
        model: OPUS,
        effort: 'max',
        fallback_chain: [],
        note: 'Security work must never cut corners',
      },
    },
    effort_levels: {
      low: {
        description:
          'Fast, minimal reasoning — routing, formatting, simple transforms',
      },
      medium: {
        description: 'Standard reasoning — most development and testing tasks',
      },
      high: {
        description:
          'Extended thinking — architecture, complex debugging, review',
      },
      xhigh: {
        description:
          'Deep reasoning — complex debugging, multi-file refactors, design review (Opus 4.7 default)',
      },
      max: {
        description:
          'Maximum effort — autonomous agents, security audits, planning',
      },
    },
    model_aliases: {
      fast: HAIKU,
      balanced: SONNET,
      powerful: OPUS,
      default: SONNET,
    },
    // Plan 38 Phase C — full 6-tier block with effort_range.
    // quick: Haiku (effort intentionally absent — Haiku does not accept effort, research §A1)
    // coding/review: Sonnet (balanced — medium/high effort; no xhigh, research §A2)
    // planning/ultra/super: Opus (best — high/xhigh/max effort; full range, research §A3)
    // Uses provider-neutral short aliases (cheap/balanced/best) per Phase B convention.
    tiers: {
      quick: {
        model: 'cheap',
        // effort intentionally absent — Haiku does not accept effort (research §A1)
        effort_range: [],
      },
      coding: {
        model: 'balanced',
        effort: 'medium',
        effort_range: ['low', 'medium', 'high', 'max'],
      },
      review: {
        model: 'balanced',
        effort: 'high',
        effort_range: ['low', 'medium', 'high', 'max'],
      },
      planning: {
        model: 'best',
        effort: 'high',
        effort_range: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
      ultra: {
        model: 'best',
        effort: 'xhigh',
        effort_range: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
      super: {
        model: 'best',
        effort: 'max',
        effort_range: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
    },
    // Plan 36 Phase B — per-agent tier/model overrides shipped in default config.
    // Plan 38 Phase B — researcher migrated from tier:standard → tier:planning (audit MAJOR-2).
    // Plan 38 Phase C — orchestrator, ultra-worker, security-auditing tier overrides per research §F1.
    // Plan 38 Phase E — full 19-agent sweep: all shipped agents pinned to their canonical tier.
    //   Agents not listed here resolve through group/default which may differ from target tier.
    // ANV-0083 — assumptions-surfacer, comment-analyzer, type-design-analyzer,
    //   retroactive-validator collapsed into sibling Task(general-purpose) prompts.
    //   See skills/universal/{brainstorm-spec,code-review,plan-verification}/*-prompt.md.
    agents: {
      // Already migrated in prior phases
      researcher: { tier: 'planning' },
      orchestrator: { tier: 'planning' },
      'ultra-worker': { tier: 'ultra' },
      'security-auditing': { tier: 'super' },
      // Phase E sweep — 13 remaining agents after ANV-0083 collapse
      'code-architect': { tier: 'planning' },
      'code-explorer': { tier: 'quick' },
      'code-quality-reviewer': { tier: 'review' },
      'code-reviewer': { tier: 'review' },
      'code-simplifier': { tier: 'review' },
      'doc-verifier': { tier: 'review' },
      'framework-selector': { tier: 'planning' },
      'mcp-builder': { tier: 'coding' },
      'plan-verifier': { tier: 'planning' },
      'silent-failure-hunter': { tier: 'ultra' },
      'spec-reviewer': { tier: 'review' },
      'strict-reviewer': { tier: 'planning' },
      'subagent-executor': { tier: 'coding' },
      'test-analyzer': { tier: 'review' },
      // Plan 39 Phase G — build-error-resolver (assumptions-surfacer collapsed in ANV-0083)
      'build-error-resolver': { tier: 'coding' },
    },
    disabled: {
      skills: [],
      hooks: [
        'post-tool-use',
        'post-test-run',
        'context-monitor',
        'prompt-guard',
        'phase-boundary',
        'read-guard',
        'workflow-guard',
        'session-end',
        'pre-compact',
        // No-op pass-throughs: registered so Claude Code sees the kinds,
        // disabled by default. Users opt in when they wire a custom handler.
        'notification',
        'stop',
        'subagent-stop',
        // Plan 32 C2 — on-large-output. Enabled when compression is configured;
        // disabled by default so existing installs are unaffected.
        'on-large-output',
      ],
      agents: [],
    },
  }
}
