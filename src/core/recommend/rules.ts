/**
 * Rules-as-data table mapping detected project signals to skill/hook/agent/mcp
 * suggestions. Read by `recommendForContext()` in `recommender.ts`.
 *
 * Slugs MUST correspond to real Anvil entities (skills under `skills/`, agents
 * under `agents/`). Inventing slugs here causes broken `anvil init --skill X`
 * install hints. When in doubt, run `ls skills/universal skills/languages/*`.
 */

export type RecommendSurface = 'skill' | 'hook' | 'agent' | 'mcp'

export interface RecommendationRule {
  /** Stable identifier, useful in --json output and tests. */
  id: string
  /**
   * Conjunctive signal: every defined field MUST match the project context.
   * Undefined fields are wildcards.
   */
  signal: {
    language?: string
    framework?: string
    testRunner?: string
    /** When true, requires at least one CI provider detected. */
    ci?: boolean
  }
  suggest: {
    surface: RecommendSurface
    slug: string
  }
  reason: string
  /** Base contribution to the aggregate score, in [0, 1]. */
  baseScore: number
}

export const RULES: readonly RecommendationRule[] = [
  // ─── Languages → coding skills ────────────────────────────────────────
  {
    id: 'lang-typescript',
    signal: { language: 'typescript' },
    suggest: { surface: 'skill', slug: 'typescript-coding' },
    reason: 'TypeScript detected — install typing + coding standards.',
    baseScore: 0.9,
  },
  {
    id: 'lang-typescript-typing',
    signal: { language: 'typescript' },
    suggest: { surface: 'skill', slug: 'typescript-typing' },
    reason: 'TypeScript detected — strict typing discipline applies.',
    baseScore: 0.7,
  },
  {
    id: 'lang-javascript',
    signal: { language: 'javascript' },
    suggest: { surface: 'skill', slug: 'javascript-coding' },
    reason: 'JavaScript detected — install coding standards.',
    baseScore: 0.85,
  },
  {
    id: 'lang-python',
    signal: { language: 'python' },
    suggest: { surface: 'skill', slug: 'python-coding' },
    reason: 'Python detected — install coding standards.',
    baseScore: 0.9,
  },
  {
    id: 'lang-python-testing',
    signal: { language: 'python' },
    suggest: { surface: 'skill', slug: 'python-testing' },
    reason: 'Python detected — install pytest workflow.',
    baseScore: 0.5,
  },
  {
    id: 'lang-go',
    signal: { language: 'go' },
    suggest: { surface: 'skill', slug: 'go-coding' },
    reason: 'Go detected — install coding standards.',
    baseScore: 0.9,
  },
  {
    id: 'lang-rust',
    signal: { language: 'rust' },
    suggest: { surface: 'skill', slug: 'rust-coding' },
    reason: 'Rust detected — install coding standards.',
    baseScore: 0.9,
  },
  {
    id: 'lang-ruby',
    signal: { language: 'ruby' },
    suggest: { surface: 'skill', slug: 'ruby-coding' },
    reason: 'Ruby detected — install coding standards.',
    baseScore: 0.9,
  },
  {
    id: 'lang-php',
    signal: { language: 'php' },
    suggest: { surface: 'skill', slug: 'php-coding' },
    reason: 'PHP detected — install coding standards.',
    baseScore: 0.9,
  },
  {
    id: 'lang-java',
    signal: { language: 'java' },
    suggest: { surface: 'skill', slug: 'java-coding' },
    reason: 'Java detected — install coding standards.',
    baseScore: 0.9,
  },
  {
    id: 'lang-kotlin',
    signal: { language: 'kotlin' },
    suggest: { surface: 'skill', slug: 'kotlin-coding' },
    reason: 'Kotlin detected — install coding standards.',
    baseScore: 0.9,
  },

  // ─── Frameworks → coding skills ───────────────────────────────────────
  {
    id: 'fw-react',
    signal: { framework: 'react' },
    suggest: { surface: 'skill', slug: 'react-coding' },
    reason: 'React detected — install component patterns.',
    baseScore: 0.85,
  },
  {
    id: 'fw-nextjs',
    signal: { framework: 'next.js' },
    suggest: { surface: 'skill', slug: 'nextjs-coding' },
    reason: 'Next.js detected — install routing + RSC patterns.',
    baseScore: 0.9,
  },
  {
    id: 'fw-django',
    signal: { framework: 'django' },
    suggest: { surface: 'skill', slug: 'django-coding' },
    reason: 'Django detected — install ORM + view patterns.',
    baseScore: 0.9,
  },
  {
    id: 'fw-fastapi',
    signal: { framework: 'fastapi' },
    suggest: { surface: 'skill', slug: 'fastapi-coding' },
    reason: 'FastAPI detected — install async route patterns.',
    baseScore: 0.9,
  },
  {
    id: 'fw-rails',
    signal: { framework: 'rails' },
    suggest: { surface: 'skill', slug: 'rails-coding' },
    reason: 'Rails detected — install MVC patterns.',
    baseScore: 0.9,
  },
  {
    id: 'fw-laravel',
    signal: { framework: 'laravel' },
    suggest: { surface: 'skill', slug: 'laravel-coding' },
    reason: 'Laravel detected — install Eloquent + routing patterns.',
    baseScore: 0.9,
  },

  // ─── Test runners → TDD skill + framework testing skills ──────────────
  {
    id: 'test-vitest-tdd',
    signal: { testRunner: 'vitest' },
    suggest: { surface: 'skill', slug: 'test-driven-development' },
    reason: 'Vitest detected — install TDD discipline.',
    baseScore: 0.6,
  },
  {
    id: 'test-jest-tdd',
    signal: { testRunner: 'jest' },
    suggest: { surface: 'skill', slug: 'test-driven-development' },
    reason: 'Jest detected — install TDD discipline.',
    baseScore: 0.6,
  },
  {
    id: 'test-pytest-tdd',
    signal: { testRunner: 'pytest' },
    suggest: { surface: 'skill', slug: 'test-driven-development' },
    reason: 'pytest detected — install TDD discipline.',
    baseScore: 0.6,
  },
  {
    id: 'test-js-testing',
    signal: { testRunner: 'vitest' },
    suggest: { surface: 'skill', slug: 'javascript-testing' },
    reason: 'Vitest detected — install JS testing patterns.',
    baseScore: 0.5,
  },

  // ─── CI presence → workflow skills + reviewer agent ───────────────────
  {
    id: 'ci-github-workflow',
    signal: { ci: true },
    suggest: { surface: 'skill', slug: 'github-workflow' },
    reason: 'CI provider detected — install PR/branch workflow.',
    baseScore: 0.5,
  },
  {
    id: 'ci-code-reviewer',
    signal: { ci: true },
    suggest: { surface: 'agent', slug: 'code-reviewer' },
    reason: 'CI present — code-reviewer agent for PR diffs.',
    baseScore: 0.4,
  },

  // ─── MCP recommendations (static) ─────────────────────────────────────
  {
    id: 'mcp-github',
    signal: { ci: true },
    suggest: { surface: 'mcp', slug: 'github' },
    reason: 'CI detected — GitHub MCP for issue/PR workflow.',
    baseScore: 0.4,
  },
  {
    id: 'mcp-postgres-django',
    signal: { framework: 'django' },
    suggest: { surface: 'mcp', slug: 'postgres' },
    reason: 'Django typically pairs with Postgres — postgres MCP.',
    baseScore: 0.3,
  },
  {
    id: 'mcp-postgres-rails',
    signal: { framework: 'rails' },
    suggest: { surface: 'mcp', slug: 'postgres' },
    reason: 'Rails typically pairs with Postgres — postgres MCP.',
    baseScore: 0.3,
  },
  {
    id: 'mcp-sqlite-python',
    signal: { language: 'python' },
    suggest: { surface: 'mcp', slug: 'sqlite' },
    reason: 'Python projects often use SQLite — sqlite MCP.',
    baseScore: 0.2,
  },
] as const
