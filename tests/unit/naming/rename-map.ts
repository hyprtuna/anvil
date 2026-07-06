/**
 * v0.10.3 slug-rename map — source of truth for Phase B/C tests.
 *
 * Each entry: { oldSlug, newSlug, oldPath, newPath, group }
 * Paths are relative to repo root.
 */

export interface RenameRow {
  oldSlug: string
  newSlug: string
  oldPath: string
  newPath: string
  group: 'A' | 'B' | 'C' | 'D'
}

export const RENAMES: RenameRow[] = [
  // Group A — Skill+Agent collisions (12)
  {
    oldSlug: 'code-reviewer',
    newSlug: 'code-review',
    oldPath: 'skills/universal/code-reviewer.md',
    // ANV-0083: subdir form colocates the comment-analyzer and
    // type-design-analyzer Task(general-purpose) prompt bodies.
    newPath: 'skills/universal/code-review/SKILL.md',
    group: 'A',
  },
  {
    oldSlug: 'code-simplifier',
    newSlug: 'code-simplification',
    oldPath: 'skills/universal/code-simplifier.md',
    newPath: 'skills/universal/code-simplification.md',
    group: 'A',
  },
  {
    oldSlug: 'doc-verifier',
    newSlug: 'doc-verification',
    oldPath: 'skills/universal/doc-verifier.md',
    newPath: 'skills/universal/doc-verification.md',
    group: 'A',
  },
  {
    oldSlug: 'framework-selector',
    newSlug: 'framework-selection',
    oldPath: 'skills/universal/framework-selector.md',
    newPath: 'skills/universal/framework-selection.md',
    group: 'A',
  },
  {
    oldSlug: 'mcp-builder',
    newSlug: 'mcp-construction',
    oldPath: 'skills/universal/mcp-builder.md',
    newPath: 'skills/universal/mcp-construction.md',
    group: 'A',
  },
  {
    oldSlug: 'orchestrator',
    newSlug: 'orchestration',
    oldPath: 'skills/universal/orchestrator.md',
    newPath: 'skills/universal/orchestration.md',
    group: 'A',
  },
  {
    oldSlug: 'plan-verifier',
    newSlug: 'plan-verification',
    oldPath: 'skills/universal/plan-verifier.md',
    // ANV-0083: subdir form colocates the retroactive-validator
    // Task(general-purpose) prompt body.
    newPath: 'skills/universal/plan-verification/SKILL.md',
    group: 'A',
  },
  {
    oldSlug: 'researcher',
    newSlug: 'research',
    oldPath: 'skills/universal/researcher.md',
    newPath: 'skills/universal/research.md',
    group: 'A',
  },
  {
    oldSlug: 'silent-failure-hunter',
    newSlug: 'silent-failure-discipline',
    oldPath: 'skills/universal/silent-failure-hunter.md',
    newPath: 'skills/universal/silent-failure-discipline.md',
    group: 'A',
  },
  {
    oldSlug: 'subagent-executor',
    newSlug: 'subagent-execution',
    oldPath: 'skills/universal/subagent-executor.md',
    newPath: 'skills/universal/subagent-execution.md',
    group: 'A',
  },
  {
    oldSlug: 'test-analyzer',
    newSlug: 'test-analysis',
    oldPath: 'skills/universal/test-analyzer.md',
    newPath: 'skills/universal/test-analysis.md',
    group: 'A',
  },
  {
    oldSlug: 'ultra-worker',
    newSlug: 'autonomous-execution',
    oldPath: 'skills/universal/ultra-worker.md',
    newPath: 'skills/universal/autonomous-execution.md',
    group: 'A',
  },

  // Group B — Universal skills with doer-suffix (30)
  {
    oldSlug: 'brainstormer',
    newSlug: 'brainstorming',
    oldPath: 'skills/universal/brainstormer.md',
    newPath: 'skills/universal/brainstorming.md',
    group: 'B',
  },
  {
    oldSlug: 'changelog-generator',
    newSlug: 'changelog-generation',
    oldPath: 'skills/universal/changelog-generator.md',
    newPath: 'skills/universal/changelog-generation.md',
    group: 'B',
  },
  {
    oldSlug: 'claude-md-improver',
    newSlug: 'claude-md-improvement',
    oldPath: 'skills/universal/claude-md-improver.md',
    newPath: 'skills/universal/claude-md-improvement.md',
    group: 'B',
  },
  {
    oldSlug: 'codebase-mapper',
    newSlug: 'codebase-mapping',
    oldPath: 'skills/universal/codebase-mapper.md',
    newPath: 'skills/universal/codebase-mapping.md',
    group: 'B',
  },
  {
    oldSlug: 'debugger',
    newSlug: 'debugging',
    oldPath: 'skills/universal/debugger.md',
    newPath: 'skills/universal/debugging.md',
    group: 'B',
  },
  {
    oldSlug: 'deep-diver',
    newSlug: 'deep-diving',
    oldPath: 'skills/universal/deep-diver.md',
    newPath: 'skills/universal/deep-diving.md',
    group: 'B',
  },
  {
    oldSlug: 'dependency-manager',
    newSlug: 'dependency-management',
    oldPath: 'skills/universal/dependency-manager.md',
    newPath: 'skills/universal/dependency-management.md',
    group: 'B',
  },
  {
    oldSlug: 'design-system-generator',
    newSlug: 'design-system-generation',
    oldPath: 'skills/universal/design-system-generator.md',
    newPath: 'skills/universal/design-system-generation.md',
    group: 'B',
  },
  {
    oldSlug: 'developer',
    newSlug: 'development',
    oldPath: 'skills/universal/developer.md',
    newPath: 'skills/universal/development.md',
    group: 'B',
  },
  {
    oldSlug: 'doc-writer',
    newSlug: 'doc-writing',
    oldPath: 'skills/universal/doc-writer.md',
    newPath: 'skills/universal/doc-writing.md',
    group: 'B',
  },
  {
    oldSlug: 'feature-developer',
    newSlug: 'feature-development',
    oldPath: 'skills/universal/feature-developer.md',
    newPath: 'skills/universal/feature-development.md',
    group: 'B',
  },
  {
    oldSlug: 'github-worker',
    newSlug: 'github-workflow',
    oldPath: 'skills/universal/github-worker.md',
    newPath: 'skills/universal/github-workflow.md',
    group: 'B',
  },
  {
    oldSlug: 'gitlab-worker',
    newSlug: 'gitlab-workflow',
    oldPath: 'skills/universal/gitlab-worker.md',
    newPath: 'skills/universal/gitlab-workflow.md',
    group: 'B',
  },
  {
    oldSlug: 'git-worker',
    newSlug: 'git-workflow',
    oldPath: 'skills/universal/git-worker.md',
    newPath: 'skills/universal/git-workflow.md',
    group: 'B',
  },
  {
    oldSlug: 'learner',
    newSlug: 'learning',
    oldPath: 'skills/universal/learner.md',
    newPath: 'skills/universal/learning.md',
    group: 'B',
  },
  {
    oldSlug: 'performance-profiler',
    newSlug: 'performance-profiling',
    oldPath: 'skills/universal/performance-profiler.md',
    newPath: 'skills/universal/performance-profiling.md',
    group: 'B',
  },
  {
    oldSlug: 'planner',
    newSlug: 'planning',
    oldPath: 'skills/universal/planner.md',
    newPath: 'skills/universal/planning.md',
    group: 'B',
  },
  {
    oldSlug: 'plan-writer',
    newSlug: 'plan-writing',
    oldPath: 'skills/universal/plan-writer.md',
    newPath: 'skills/universal/plan-writing/SKILL.md',
    group: 'B',
  },
  {
    oldSlug: 'project-explorer',
    newSlug: 'project-exploration',
    oldPath: 'skills/universal/project-explorer.md',
    newPath: 'skills/universal/project-exploration.md',
    group: 'B',
  },
  {
    oldSlug: 'review-requester',
    newSlug: 'review-requesting',
    oldPath: 'skills/universal/review-requester.md',
    newPath: 'skills/universal/review-requesting.md',
    group: 'B',
  },
  {
    oldSlug: 'review-responder',
    newSlug: 'review-response',
    oldPath: 'skills/universal/review-responder.md',
    newPath: 'skills/universal/review-response.md',
    group: 'B',
  },
  {
    oldSlug: 'security-auditor',
    newSlug: 'security-auditing',
    oldPath: 'skills/universal/security-auditor.md',
    newPath: 'skills/universal/security-auditing.md',
    group: 'B',
  },
  {
    oldSlug: 'skill-creator',
    newSlug: 'skill-creation',
    oldPath: 'skills/universal/skill-creator.md',
    newPath: 'skills/universal/skill-creation.md',
    group: 'B',
  },
  {
    oldSlug: 'skill-orchestrator',
    newSlug: 'skill-orchestration',
    oldPath: 'skills/universal/skill-orchestrator.md',
    newPath: 'skills/universal/skill-orchestration.md',
    group: 'B',
  },
  {
    oldSlug: 'skill-selector',
    newSlug: 'skill-selection',
    oldPath: 'skills/universal/skill-selector.md',
    newPath: 'skills/universal/skill-selection.md',
    group: 'B',
  },
  {
    oldSlug: 'slop-remover',
    newSlug: 'slop-removal',
    oldPath: 'skills/universal/slop-remover.md',
    newPath: 'skills/universal/slop-removal.md',
    group: 'B',
  },
  {
    oldSlug: 'summarizer',
    newSlug: 'summarization',
    oldPath: 'skills/universal/summarizer.md',
    newPath: 'skills/universal/summarization.md',
    group: 'B',
  },
  {
    oldSlug: 'tdd-worker',
    newSlug: 'test-driven-development',
    oldPath: 'skills/universal/tdd-worker.md',
    newPath: 'skills/universal/test-driven-development.md',
    group: 'B',
  },
  {
    oldSlug: 'ui-designer',
    newSlug: 'ui-design',
    oldPath: 'skills/universal/ui-designer.md',
    newPath: 'skills/universal/ui-design.md',
    group: 'B',
  },
  {
    oldSlug: 'verifier',
    newSlug: 'verification',
    oldPath: 'skills/universal/verifier.md',
    newPath: 'skills/universal/verification.md',
    group: 'B',
  },

  // Group C — UI skills (2)
  {
    oldSlug: 'color-palette-designer',
    newSlug: 'color-palette-design',
    oldPath: 'skills/universal/ui/color-palette-designer.md',
    newPath: 'skills/universal/ui/color-palette-design.md',
    group: 'C',
  },
  {
    oldSlug: 'style-chooser',
    newSlug: 'style-selection',
    oldPath: 'skills/universal/ui/style-chooser.md',
    newPath: 'skills/universal/ui/style-selection.md',
    group: 'C',
  },

  // Group D — Language skills (26)
  {
    oldSlug: 'cpp-developer',
    newSlug: 'cpp-coding',
    oldPath: 'skills/languages/cpp/cpp-developer.md',
    newPath: 'skills/languages/cpp/cpp-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'csharp-developer',
    newSlug: 'csharp-coding',
    oldPath: 'skills/languages/csharp/csharp-developer.md',
    newPath: 'skills/languages/csharp/csharp-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'django-developer',
    newSlug: 'django-coding',
    oldPath: 'skills/languages/django/django-developer.md',
    newPath: 'skills/languages/django/django-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'fastapi-developer',
    newSlug: 'fastapi-coding',
    oldPath: 'skills/languages/fastapi/fastapi-developer.md',
    newPath: 'skills/languages/fastapi/fastapi-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'go-developer',
    newSlug: 'go-coding',
    oldPath: 'skills/languages/go/go-developer.md',
    newPath: 'skills/languages/go/go-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'go-tester',
    newSlug: 'go-testing',
    oldPath: 'skills/languages/go/go-tester.md',
    newPath: 'skills/languages/go/go-testing.md',
    group: 'D',
  },
  {
    oldSlug: 'java-developer',
    newSlug: 'java-coding',
    oldPath: 'skills/languages/java/java-developer.md',
    newPath: 'skills/languages/java/java-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'js-developer',
    newSlug: 'javascript-coding',
    oldPath: 'skills/languages/javascript/js-developer.md',
    newPath: 'skills/languages/javascript/javascript-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'js-tester',
    newSlug: 'javascript-testing',
    oldPath: 'skills/languages/javascript/js-tester.md',
    newPath: 'skills/languages/javascript/javascript-testing.md',
    group: 'D',
  },
  {
    oldSlug: 'kotlin-developer',
    newSlug: 'kotlin-coding',
    oldPath: 'skills/languages/kotlin/kotlin-developer.md',
    newPath: 'skills/languages/kotlin/kotlin-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'laravel-developer',
    newSlug: 'laravel-coding',
    oldPath: 'skills/languages/laravel/laravel-developer.md',
    newPath: 'skills/languages/laravel/laravel-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'nextjs-developer',
    newSlug: 'nextjs-coding',
    oldPath: 'skills/languages/nextjs/nextjs-developer.md',
    newPath: 'skills/languages/nextjs/nextjs-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'php-developer',
    newSlug: 'php-coding',
    oldPath: 'skills/languages/php/php-developer.md',
    newPath: 'skills/languages/php/php-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'php-reviewer',
    newSlug: 'php-review',
    oldPath: 'skills/languages/php/php-reviewer.md',
    newPath: 'skills/languages/php/php-review.md',
    group: 'D',
  },
  {
    oldSlug: 'php-tester',
    newSlug: 'php-testing',
    oldPath: 'skills/languages/php/php-tester.md',
    newPath: 'skills/languages/php/php-testing.md',
    group: 'D',
  },
  {
    oldSlug: 'python-developer',
    newSlug: 'python-coding',
    oldPath: 'skills/languages/python/python-developer.md',
    newPath: 'skills/languages/python/python-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'python-tester',
    newSlug: 'python-testing',
    oldPath: 'skills/languages/python/python-tester.md',
    newPath: 'skills/languages/python/python-testing.md',
    group: 'D',
  },
  {
    oldSlug: 'rails-developer',
    newSlug: 'rails-coding',
    oldPath: 'skills/languages/rails/rails-developer.md',
    newPath: 'skills/languages/rails/rails-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'react-developer',
    newSlug: 'react-coding',
    oldPath: 'skills/languages/react/react-developer.md',
    newPath: 'skills/languages/react/react-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'ruby-developer',
    newSlug: 'ruby-coding',
    oldPath: 'skills/languages/ruby/ruby-developer.md',
    newPath: 'skills/languages/ruby/ruby-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'rust-developer',
    newSlug: 'rust-coding',
    oldPath: 'skills/languages/rust/rust-developer.md',
    newPath: 'skills/languages/rust/rust-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'rust-tester',
    newSlug: 'rust-testing',
    oldPath: 'skills/languages/rust/rust-tester.md',
    newPath: 'skills/languages/rust/rust-testing.md',
    group: 'D',
  },
  {
    oldSlug: 'spring-developer',
    newSlug: 'spring-coding',
    oldPath: 'skills/languages/spring/spring-developer.md',
    newPath: 'skills/languages/spring/spring-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'swift-developer',
    newSlug: 'swift-coding',
    oldPath: 'skills/languages/swift/swift-developer.md',
    newPath: 'skills/languages/swift/swift-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'ts-developer',
    newSlug: 'typescript-coding',
    oldPath: 'skills/languages/typescript/ts-developer.md',
    newPath: 'skills/languages/typescript/typescript-coding.md',
    group: 'D',
  },
  {
    oldSlug: 'ts-typer',
    newSlug: 'typescript-typing',
    oldPath: 'skills/languages/typescript/ts-typer.md',
    newPath: 'skills/languages/typescript/typescript-typing.md',
    group: 'D',
  },
]

/** Approved agent doer-suffixes (per Plan 40 audit). Order matters: longest first. */
export const APPROVED_AGENT_SUFFIXES = [
  '-orchestrator',
  '-architect',
  '-simplifier',
  '-surfacer',
  '-validator',
  '-resolver',
  '-reviewer',
  '-explorer',
  '-analyzer',
  '-selector',
  '-verifier',
  '-builder',
  '-hunter',
  '-worker',
  // generic fallbacks (must be last; least specific)
  '-er',
  '-or',
]

/**
 * Returns the approved suffix the slug ends with, or null.
 *
 * Matching rules:
 * - Compound suffixes (`-architect`, `-builder`, ...) match only when preceded
 *   by a hyphen OR when the slug equals the bare form (e.g., `orchestrator`).
 * - Generic English doer-suffixes `-er` / `-or` match by character ending
 *   (`researcher`, `subagent-executor` both pass). These are intentionally
 *   permissive because English doer-nouns are formed by appending `er`/`or`
 *   without a hyphen.
 */
export function endsInApprovedSuffix(slug: string): string | null {
  // Try compound suffixes first (longest, most specific).
  for (const sfx of APPROVED_AGENT_SUFFIXES) {
    if (sfx === '-er' || sfx === '-or') continue
    const bare = sfx.slice(1)
    if (slug.endsWith(sfx) || slug === bare) return sfx
  }
  // Generic fallbacks: match by raw character ending.
  if (slug.endsWith('er')) return '-er'
  if (slug.endsWith('or')) return '-or'
  return null
}
