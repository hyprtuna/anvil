import { z } from 'zod'
import { findNearest } from './_levenshtein.js'

/**
 * Builds a Zod `errorMap` for an enum that emits a "Did you mean X?" hint
 * when the input is a close typo, or lists valid options otherwise.
 */
function enumErrorMap<T extends readonly [string, ...string[]]>(
  values: T,
): z.ZodErrorMap {
  return (_issue, ctx) => {
    const input = String(ctx.data)
    const suggestion = findNearest(input, values)
    const hint = suggestion
      ? ` Did you mean '${suggestion}'?`
      : ` Valid values: ${values.join(', ')}.`
    return { message: `Invalid value '${input}'.${hint}` }
  }
}

// ─── Effort ─────────────────────────────────────────────────────────────
const EFFORT_LEVEL_VALUES = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export const EffortLevel = z.enum(EFFORT_LEVEL_VALUES, {
  errorMap: enumErrorMap(EFFORT_LEVEL_VALUES),
})
export type EffortLevel = z.infer<typeof EffortLevel>

// ─── Resolution source ──────────────────────────────────────────────────
export const ResolutionSource = z.enum([
  'cli',
  'cli-tier',
  'session',
  'env',
  'agent-override',
  'tier',
  'override',
  'group',
  'default',
])
export type ResolutionSource = z.infer<typeof ResolutionSource>

// ─── Session override (written by `anvil model <id>`) ───────────────────
export const ActiveModelFile = z.object({
  model: z.string().min(1),
  effort: EffortLevel.optional(),
  set_at: z.string().datetime(),
})
export type ActiveModelFile = z.infer<typeof ActiveModelFile>

// ─── Agent tier + mode (Plan 36 Phase A, extended Plan 38 Phase B) ──────────
// Forward-declared before ModelsConfig so tiers/agents can reference them.

/**
 * Tier abstraction: maps a symbolic name to a concrete model via ModelsConfig.tiers.
 * Six tiers replace the v0.10.0 trio (quick/standard/deep) — pre-release, no migration shim.
 * See `.anvil/specs/tiers.md` for the full tier reference and provider override walkthrough.
 */
const AGENT_TIER_VALUES = [
  'quick',
  'coding',
  'review',
  'planning',
  'ultra',
  'super',
] as const
export const AgentTier = z.enum(AGENT_TIER_VALUES, {
  errorMap: enumErrorMap(AGENT_TIER_VALUES),
})
export type AgentTier = z.infer<typeof AgentTier>

/** Whether the agent is a primary entry-point or a subagent spawned by another agent. */
export const AgentMode = z.enum(['primary', 'subagent'])
export type AgentMode = z.infer<typeof AgentMode>

// ─── Tier config (Plan 36 Phase A, extended Plan 38 Phase C) ────────────────

/**
 * Configuration for a named tier in ModelsConfig.tiers.
 * Maps a tier name (quick/coding/review/planning/ultra/super or custom) to a concrete model.
 */
export const TierConfig = z.object({
  model: z.string(),
  effort: EffortLevel.optional(),
  /**
   * Informational: effort levels valid for the model this tier resolves to.
   * Used in `anvil doctor` and trace logs. NOT enforced at parse time —
   * CC clamps gracefully and Anvil's resolver matches CC behavior via
   * clampEffortForModel(). See research §C1, §C2.
   */
  effort_range: z.array(EffortLevel).optional(),
  /**
   * Per-tier fallback chain consumed by runner.ts on transient SDK
   * failures. Agent-level fallback_chain (in AgentFrontmatter) wins
   * over this.
   */
  fallback_chain: z.array(z.string()).optional(),
})
export type TierConfig = z.infer<typeof TierConfig>

// ─── Agent model config (Plan 36 Phase A) ───────────────────────────────────

/**
 * Per-agent model override in ModelsConfig.agents.
 * Requires at least one of `model` or `tier` to be present.
 */
export const AgentModelConfig = z
  .object({
    model: z.string().optional(),
    tier: AgentTier.optional(),
    fallback_chain: z.array(z.string()).optional(),
  })
  .refine((d) => d.model !== undefined || d.tier !== undefined, {
    message: 'AgentModelConfig requires at least one of "model" or "tier"',
  })
export type AgentModelConfig = z.infer<typeof AgentModelConfig>

// ─── Models configuration ──────────────────────────────────────────────
export const ModelDefaults = z.object({
  model: z.string().min(1),
  effort: EffortLevel,
  fallback_model: z.string().optional(),
  fallback_chain: z.array(z.string()).default([]),
  max_tokens: z.number().int().positive(),
})
export type ModelDefaults = z.infer<typeof ModelDefaults>

export const ModelGroup = z.object({
  model: z.string().min(1),
  effort: EffortLevel,
  description: z.string(),
  members: z.array(z.string()),
  fallback_chain: z.array(z.string()).default([]),
})
export type ModelGroup = z.infer<typeof ModelGroup>

export const ModelOverride = z.object({
  model: z.string().min(1),
  effort: EffortLevel,
  max_tokens: z.number().int().positive().optional(),
  note: z.string().optional(),
  fallback_chain: z.array(z.string()).default([]),
})
export type ModelOverride = z.infer<typeof ModelOverride>

export const RouterThresholds = z
  .object({
    ask_tie_tolerance: z.number().min(0).max(1),
    multi_intent_threshold: z.number().min(0).max(1),
    confidence_floor: z.number().min(0).max(1),
    directive_threshold: z.number().min(0).max(1),
  })
  .partial()
export type RouterThresholds = z.infer<typeof RouterThresholds>

export const RouterConfig = z
  .object({
    thresholds: RouterThresholds.optional(),
  })
  .partial()
export type RouterConfig = z.infer<typeof RouterConfig>

export const HookKind = z.enum([
  'session-start',
  'session-end',
  'user-prompt-submit',
  'pre-tool-use',
  'post-tool-use',
  'pre-compact',
  'notification',
  'stop',
  'subagent-stop',
  'pre-commit',
  'post-edit',
  'pre-push',
  'on-error',
  'on-pr-open',
  'post-test-run',
  'context-monitor',
  'prompt-guard',
  'phase-boundary',
  'read-guard',
  'workflow-guard',
  // Plan 32 Phase C1 — fires after post-tool-use when tool result word count
  // exceeds compression.threshold_words. Replaces the tool result in context
  // with a ≤200-word summary and stashes the raw output to the notepad.
  'on-large-output',
])
export type HookKind = z.infer<typeof HookKind>

export const ModelsConfig = z
  .object({
    $schema: z.string().optional(),
    version: z.string(),
    defaults: ModelDefaults,
    groups: z.record(z.string(), ModelGroup),
    overrides: z.record(z.string(), ModelOverride).default({}),
    effort_levels: z.record(EffortLevel, z.object({ description: z.string() })),
    model_aliases: z.object({
      fast: z.string(),
      balanced: z.string(),
      powerful: z.string(),
      default: z.string(),
    }),
    disabled: z
      .object({
        skills: z.array(z.string()).default([]),
        // v0.11.0 BREAKING: narrowed from z.array(z.string()) to z.array(HookKind).
        // Stale tokens from removed kinds (comment-checker, rules-injector,
        // and 14 D1 stubs) now fail Zod validation at config load.
        hooks: z.array(HookKind).default([]),
        agents: z.array(z.string()).default([]),
      })
      .default({ skills: [], hooks: [], agents: [] }),
    router: RouterConfig.optional(),
    /**
     * User-pinned skill versions (Plan 30 G3).
     * Maps skill name → minimum acceptable version (semver x.y.z).
     * Doctor warns when a loaded skill's declared `version` is below
     * the pinned minimum.  Skills that don't declare a `version` field
     * are silently skipped (no warning).
     *
     * Example entry in models.json:
     *   "skill_versions": { "debugging": "1.2.0" }
     */
    skill_versions: z
      .record(
        z.string(),
        z.string().regex(/^\d+\.\d+\.\d+$/, 'must be semver x.y.z'),
      )
      .optional(),
    /**
     * Statusline configuration (Plan 29 Phase F1).
     * `show_subagent_panel` opts in to the `subagentStatusLine` CC setting —
     * default false so existing installs are unaffected.
     */
    statusline: z
      .object({
        tier: z.enum(['minimal', 'default', 'maximal']).optional(),
        show_subagent_panel: z.boolean().default(false),
        /** Plan 34 A1 — 'rich' = truecolor RGB gradient render; 'simple' = legacy tier-based render. */
        template: z.enum(['simple', 'rich']).default('rich'),
        /**
         * Plan 45 / v0.11.0 — opt-in OSC 8 hyperlinks in rich/maximal statusline.
         * Default false. Even when true, links only render under TERM_PROGRAM ∈
         * {iTerm.app, WezTerm, kitty, ghostty} (Apple Terminal excluded per D-08).
         */
        links: z.boolean().default(false),
      })
      .optional(),
    /**
     * Skill loading configuration (Plan 32 Phase B1).
     * `lazy_load: true` causes the loader to return frontmatter + source path
     * only; skill bodies are fetched on first access via `getSkillBody()`.
     * Default stays `false` (eager) so existing users see no change.
     */
    skills: z
      .object({
        lazy_load: z.boolean().default(false),
      })
      .default({ lazy_load: false })
      .optional(),
    /**
     * Output compression configuration (Plan 32 Phase C5).
     * When a tool result exceeds `threshold_words`, the `on-large-output` hook
     * fires and the handler applies the configured strategy.
     *
     * strategy:
     *   'summary'  — invoke the summarization skill (Haiku) for a ≤200-word summary
     *   'diffstat' — stat-style summary for unified-diff output; falls back to 'summary'
     *   'skip'     — advisory/no-op; leaves the original output intact
     */
    compression: z
      .object({
        threshold_words: z.number().int().positive().default(5000),
        strategy: z.enum(['summary', 'diffstat', 'skip']).default('summary'),
        /**
         * ANV-0114 — cumulative `expected_tokens` warning threshold.
         * Installer sums `expected_tokens` across selected skills + agents
         * and warns when the total exceeds this value. Default 50,000.
         * Set very high (or use `--allow-large-bundle`) to suppress.
         */
        expected_tokens_warn: z.number().int().positive().default(50_000),
        /**
         * Per-tool token budgets (ANV-0046).
         * Maps tool name (case-insensitive) to a token ceiling. When the tool
         * result's estimated token count exceeds the budget, the handler fires
         * even if `threshold_words` has not been reached.
         *
         * Defaults applied by the handler when no explicit budget is set:
         *   webfetch → 10,000
         *   bash     → 50,000
         *   read     → 50,000
         *   <any>    → 50,000
         *
         * Env override: ANVIL_TOOL_BUDGET_<TOOL>=N (TOOL uppercased, hyphens → underscores).
         */
        tool_budgets: z
          .record(z.string(), z.number().int().positive())
          .optional(),
      })
      .optional(),
    /**
     * Hook execution configuration (Plan 34 C4 / ANV-0056).
     * `timeout_seconds` — per-handler hard timeout; dispatcher aborts any handler
     * that exceeds this and returns a safe {exitCode: 0}. Default 30 seconds.
     * `session_start.budget_chars` — aggregate char cap for all SessionStart
     * handler systemInsert outputs combined. Higher-priority handlers win the
     * budget first; lower-priority outputs are dropped with a truncation notice.
     * Default 6000 chars (≈1500 tokens at 4 chars/token). Set to 0 to suppress
     * all SessionStart context injection.
     */
    hooks: z
      .object({
        timeout_seconds: z.number().int().positive().default(30),
        session_start: z
          .object({
            budget_chars: z.number().int().nonnegative().default(6000),
          })
          .optional(),
      })
      // ANV-0128 — accept per-handler entries `hooks.<name>.profile` for
      // profile selection. Unknown keys are interpreted as handler-config
      // blocks; reserved keys above (`timeout_seconds`, `session_start`)
      // keep their existing schemas.
      .catchall(
        z
          .object({
            profile: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    /**
     * Rule-reinforcement configuration (ANV-0124).
     *
     * `every_n_turns`     — cadence: inject after every N turns since the
     *                       last injection (default 20).
     * `keyword_triggers`  — case-insensitive substring triggers (default
     *                       ["let's just", "skip the", "for now", "just do it"]).
     * `disable`           — kill switch (env override ANVIL_DISABLE_REINFORCEMENT=1
     *                       takes precedence).
     * `token_budget`      — per-inject token cap (~500 default). Clamped to the
     *                       shared SessionStart reservation in shared-budget.ts.
     */
    reinforcement: z
      .object({
        every_n_turns: z.number().int().positive().optional(),
        keyword_triggers: z.array(z.string()).optional(),
        disable: z.boolean().optional(),
        token_budget: z.number().int().nonnegative().optional(),
      })
      .partial()
      .optional(),
    /**
     * Pre-compact handler configuration (ANV-0126).
     *
     * `disable`           — kill switch for both the snapshot writer AND the
     *                       SessionStart restore digest (env override
     *                       ANVIL_DISABLE_PRE_COMPACT=1 takes precedence).
     * `restore_window_ms` — sidecars older than this are ignored on restore
     *                       (default 3_600_000 ms = 1h).
     */
    pre_compact: z
      .object({
        disable: z.boolean().optional(),
        restore_window_ms: z.number().int().positive().optional(),
      })
      .partial()
      .optional(),
    /**
     * Named tier definitions (Plan 36 Phase A, extended Plan 38 Phase B).
     * Maps tier names (quick/coding/review/planning/ultra/super or custom) to concrete model configs.
     * Consumed by the 7-layer resolver. See `.anvil/specs/tiers.md` for full reference.
     *
     * Example (uses provider-neutral aliases — see src/core/models/aliases.ts):
     *   "tiers": {
     *     "quick":    { "model": "cheap" },
     *     "coding":   { "model": "balanced", "effort": "medium" },
     *     "planning": { "model": "best", "effort": "high" }
     *   }
     */
    tiers: z.record(z.string(), TierConfig).optional(),
    /**
     * Per-agent model overrides (Plan 36 Phase A).
     * Maps agent name to a model/tier override. Wins between ENV and group
     * in the 7-layer resolution chain (layer 4 = agent-override).
     *
     * Example:
     *   "agents": {
     *     "researcher": { "tier": "planning" },
     *     "ultra-worker": { "model": "best", "effort": "xhigh" }
     *   }
     */
    agents: z.record(z.string(), AgentModelConfig).optional(),
  })
  .refine(
    (cfg) => {
      // Circular tier alias rejection (Plan 36 Phase B):
      // A tier's model must not equal any other tier name.
      // e.g. tiers.standard.model = 'deep' is invalid because 'deep' is a tier name.
      if (!cfg.tiers) return true
      const tierNames = new Set(Object.keys(cfg.tiers))
      for (const [tierName, tierCfg] of Object.entries(cfg.tiers)) {
        if (tierCfg.model !== tierName && tierNames.has(tierCfg.model)) {
          return false
        }
      }
      return true
    },
    (cfg) => {
      // Build a descriptive error message showing which tier is circular
      const tiers = cfg.tiers ?? {}
      const tierNames = new Set(Object.keys(tiers))
      for (const [tierName, tierCfg] of Object.entries(tiers)) {
        if (tierCfg.model !== tierName && tierNames.has(tierCfg.model)) {
          return {
            message: `Circular tier alias: tiers.${tierName}.model = "${tierCfg.model}" which is itself a tier name. Tier models must resolve to concrete model IDs, not other tier names.`,
            path: ['tiers', tierName, 'model'],
          }
        }
      }
      return {
        message: 'Circular tier alias detected in tiers config',
        path: ['tiers'],
      }
    },
  )
export type ModelsConfig = z.infer<typeof ModelsConfig>

export const ModelResolution = z.object({
  model: z.string().min(1),
  /**
   * Resolved effort level after clamping via `clampEffortForModel` (Plan 38 Phase A).
   * May be `undefined` when the resolved model does not accept an effort parameter
   * (e.g., Haiku). Callers should treat `undefined` as "omit effort from the API call".
   */
  effort: EffortLevel.optional(),
  max_tokens: z.number().int().positive(),
  source: ResolutionSource,
  fallback_model: z.string().optional(),
  fallback_chain: z.array(z.string()).default([]),
  /**
   * The resolution layer from which `fallback_chain` was taken.
   * Absent when the chain is empty (no layer defined one).
   * Separate from `source` so callers can tell which layer provided the
   * primary model vs which layer provided the fallback cascade.
   */
  fallback_chain_source: ResolutionSource.optional(),
  /**
   * ANV-0033 — Provenance tag: where did the capability metadata for the
   * resolved model come from? Omitted when no `capabilityRegistry` was
   * threaded into the resolver (D-06 — backwards compat).
   */
  capability_source: z
    .enum(['snapshot', 'user-config', 'heuristic', 'unknown'])
    .optional(),
})
export type ModelResolution = z.infer<typeof ModelResolution>

// ─── Model capability snapshot (ANV-0033) ──────────────────────────────────

/**
 * Where capability metadata for a resolved model came from.
 * - 'snapshot'    — found in the bundled `data/model-capabilities.json`.
 * - 'user-config' — from a user-supplied capability override (reserved, not wired).
 * - 'heuristic'   — matched a known family pattern or BUILTIN_SUPPORTED_EFFORTS.
 * - 'unknown'     — no source could be determined.
 */
export const CapabilitySource = z.enum([
  'snapshot',
  'user-config',
  'heuristic',
  'unknown',
])
export type CapabilitySource = z.infer<typeof CapabilitySource>

/**
 * Capability record for a single concrete model ID.
 * All fields except `id` and `provider` are optional — partial records are valid.
 */
export const ModelCapability = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  family: z.string().optional(),
  context_window: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  supported_efforts: z.array(EffortLevel).optional(),
  capabilities: z
    .object({
      vision: z.boolean().optional(),
      json_mode: z.boolean().optional(),
      tool_use: z.boolean().optional(),
      extended_thinking: z.boolean().optional(),
    })
    .partial()
    .optional(),
  deprecated: z.boolean().optional(),
  notes: z.string().optional(),
})
export type ModelCapability = z.infer<typeof ModelCapability>

/**
 * Top-level bundled snapshot document (`data/model-capabilities.json`).
 * `schema_version: 1` is a Zod literal — bumping it is a breaking-schema change.
 */
export const ModelCapabilitySnapshot = z.object({
  schema_version: z.literal(1),
  generated_at: z.string().datetime(),
  source: z.string().min(1),
  models: z.array(ModelCapability),
})
export type ModelCapabilitySnapshot = z.infer<typeof ModelCapabilitySnapshot>

// ─── Skill scope enum (ANV-0123) ────────────────────────────────────────────
/**
 * Where a loaded skill physically lives on disk:
 *   - 'project'  — `<cwd>/.claude/skills/` or `<cwd>/.opencode/skills/`
 *   - 'home'     — `~/.anvil/skills/`, `~/.claude/skills/`, `~/.opencode/skills/`
 *   - 'bundled'  — shipped inside the Anvil source tree (`skills/`)
 *
 * Precedence on slug collision: Project > Home > Bundled (matches the broader
 * SkillProvider rank order in `src/skills/providers.ts`, projected down to
 * the three scopes that doctor + routing care about).
 *
 * This is *complementary* to `SkillProvider` (managed/plugin/harness exist
 * there too). `SkillScope` is the user-facing simplification: a skill author
 * thinks "is this in my project, my home, or bundled?" not "what provider
 * rank does this load under?".
 */
export const SkillScope = z.enum(['project', 'home', 'bundled'])
export type SkillScope = z.infer<typeof SkillScope>

// ─── Activation block (ANV-0122) ────────────────────────────────────────────
/**
 * Optional frontmatter block declaring concrete pre-filter conditions for a
 * skill. When present, the loader pre-filters skills whose declared
 * conditions cannot match the current context BEFORE routing — saving an
 * LLM round-trip on skills that obviously do not apply.
 *
 * All three sub-fields are optional. An empty `activation: {}` block matches
 * every context (treated identically to "no activation block").
 *
 *   - globs:     file glob patterns; the skill activates only when at least
 *                one matching file exists in the project.
 *   - languages: language names (`'typescript'`, `'python'`, …); the skill
 *                activates only when the project context reports at least
 *                one of these languages.
 *   - events:    hook event names (`'pre-edit'`, `'session-start'`, …);
 *                forward-declared, currently informational. The hook
 *                dispatcher does not yet consume this filter.
 *
 * Backward-compat: skills with NO `activation` block continue to load and
 * route exactly as before — `undefined` means "no pre-filter declared".
 */
export const ActivationBlock = z
  .object({
    globs: z.array(z.string().min(1)).optional(),
    languages: z.array(z.string().min(1)).optional(),
    events: z.array(z.string().min(1)).optional(),
  })
  .strict()
export type ActivationBlock = z.infer<typeof ActivationBlock>

// ─── Skill provenance enum (Plan 44 Phase A, Item 21) ──────────────────────
// Forward-declared so SkillFrontmatter can reference it inline. `unknown` is
// the loader-synthesized default for skills that don't declare a `source`
// and live outside the shipped `skills/{universal,languages}/` tree.
export const SkillProvenanceSource = z.enum([
  'authored',
  'distilled',
  'imported',
  'unknown',
])
export type SkillProvenanceSource = z.infer<typeof SkillProvenanceSource>

// ─── Skill MCP + context provider metadata (ANV-0037) ─────────────────────
/**
 * MCP server reference declared by a skill.
 *
 * Two valid shapes:
 *   1. stdio (process-spawn) — `{ name, command, args?, cwd?, env? }`
 *   2. transport (stdio | sse) — `{ name, transport, url? }`
 *
 * Anvil declares-only. It does not spawn or supervise the server; the host
 * runtime (Claude Code / OpenCode) wires the actual lifecycle. The doctor
 * validates availability (command-on-PATH or URL reachable).
 */
export const SkillMcpServerRef = z.union([
  z.object({
    name: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    name: z.string().min(1),
    transport: z.enum(['stdio', 'sse']),
    url: z.string().optional(),
  }),
])
export type SkillMcpServerRef = z.infer<typeof SkillMcpServerRef>

/**
 * Context provider reference declared by a skill.
 *
 * Anvil recommends — does not build — memory/codegraph backends. Consumers
 * (e.g. claude-mem plugin for `memory`, graphify for `codegraph`) wire the
 * actual provider; Anvil only carries the declaration through the skill
 * manifest.
 */
export const ContextProviderRef = z.object({
  kind: z.enum(['memory', 'codegraph', 'docs', 'custom']),
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
})
export type ContextProviderRef = z.infer<typeof ContextProviderRef>

// ─── Agent tool enum (forward-declared for SkillFrontmatter.allowed-tools) ──
/**
 * Claude Code subagent `tools` field. Restricted to the 5 tools Anvil agents
 * are authorized to use. Accepts either a string[] or a single
 * comma-separated string (Claude Code accepts both shapes).
 */
export const AgentTool = z.enum(['Read', 'Edit', 'Bash', 'Glob', 'Grep'])
export type AgentTool = z.infer<typeof AgentTool>

export const AgentTools = z.union([
  z.array(AgentTool),
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    )
    .pipe(z.array(AgentTool)),
])

// ─── Agent permission taxonomy (ANV-0003) ───────────────────────────────────
/**
 * Permission classes derived from an agent's doer-noun suffix.
 *
 * Two buckets:
 *   - **read-only**  → agent inspects but does not mutate. May Read/Glob/Grep.
 *                      MUST NOT carry `Edit`, `Write`, or unconstrained `Bash`.
 *   - **write-capable** → agent may mutate the workspace. `Edit` / `Bash` ok.
 *
 * The class is keyed by suffix (without the leading hyphen).
 */
export const AgentPermissionClass = z.enum([
  'reviewer',
  'analyzer',
  'explorer',
  'hunter',
  'surfacer',
  'validator',
  'verifier',
  'selector',
  'architect',
  'orchestrator',
  'builder',
  'resolver',
  'simplifier',
  'worker',
])
export type AgentPermissionClass = z.infer<typeof AgentPermissionClass>

/**
 * Permission scope buckets.
 *
 * - `read-only`    — Read/Glob/Grep only. No `Edit`, no `Write`, no `Bash`.
 * - `write-capable` — Read/Glob/Grep PLUS `Edit` and/or `Bash` allowed.
 */
export const AgentPermissionScope = z.enum(['read-only', 'write-capable'])
export type AgentPermissionScope = z.infer<typeof AgentPermissionScope>

/**
 * Per-class permission entry. Declares the scope bucket and the concrete set
 * of tools the class is *allowed* to declare on its frontmatter.
 *
 * `forbiddenTools` is the inverse — tools whose presence is a violation.
 * Mirrored explicitly (rather than computed) so the schema doubles as
 * documentation for downstream readers.
 */
export const AgentPermissionEntry = z
  .object({
    class: AgentPermissionClass,
    scope: AgentPermissionScope,
    allowedTools: z.array(AgentTool).readonly(),
    forbiddenTools: z.array(AgentTool).readonly(),
  })
  .strict()
export type AgentPermissionEntry = z.infer<typeof AgentPermissionEntry>

/**
 * The taxonomy map — class -> permission entry. Frozen at the module level
 * and validated against the Zod schema at load time. `anvil doctor` looks
 * up each agent's class from its slug suffix and compares its declared
 * `tools:` field to this map.
 *
 * Read-only classes:
 *   reviewer, analyzer, explorer, hunter, surfacer, validator, verifier, selector
 *
 * Write-capable classes:
 *   architect, orchestrator, builder, resolver, simplifier, worker
 *
 * Naming-derived: the class is determined by the agent slug's doer-noun
 * suffix (per CLAUDE.md naming rules). No agent frontmatter field is needed.
 */
const READ_ONLY_TOOLS: readonly AgentTool[] = ['Read', 'Glob', 'Grep']
const WRITE_CAPABLE_TOOLS: readonly AgentTool[] = [
  'Read',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
]
const FORBIDDEN_FOR_READ_ONLY: readonly AgentTool[] = ['Edit', 'Bash']

export const AGENT_PERMISSION_TAXONOMY: Readonly<
  Record<AgentPermissionClass, AgentPermissionEntry>
> = Object.freeze({
  // ─── Read-only classes ──────────────────────────────────────────────────
  reviewer: {
    class: 'reviewer',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },
  analyzer: {
    class: 'analyzer',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },
  explorer: {
    class: 'explorer',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },
  hunter: {
    class: 'hunter',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },
  surfacer: {
    class: 'surfacer',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },
  validator: {
    class: 'validator',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },
  verifier: {
    class: 'verifier',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },
  selector: {
    class: 'selector',
    scope: 'read-only',
    allowedTools: READ_ONLY_TOOLS,
    forbiddenTools: FORBIDDEN_FOR_READ_ONLY,
  },

  // ─── Write-capable classes ──────────────────────────────────────────────
  architect: {
    class: 'architect',
    scope: 'write-capable',
    allowedTools: WRITE_CAPABLE_TOOLS,
    forbiddenTools: [],
  },
  orchestrator: {
    class: 'orchestrator',
    scope: 'write-capable',
    allowedTools: WRITE_CAPABLE_TOOLS,
    forbiddenTools: [],
  },
  builder: {
    class: 'builder',
    scope: 'write-capable',
    allowedTools: WRITE_CAPABLE_TOOLS,
    forbiddenTools: [],
  },
  resolver: {
    class: 'resolver',
    scope: 'write-capable',
    allowedTools: WRITE_CAPABLE_TOOLS,
    forbiddenTools: [],
  },
  simplifier: {
    class: 'simplifier',
    scope: 'write-capable',
    allowedTools: WRITE_CAPABLE_TOOLS,
    forbiddenTools: [],
  },
  worker: {
    class: 'worker',
    scope: 'write-capable',
    allowedTools: WRITE_CAPABLE_TOOLS,
    forbiddenTools: [],
  },
})

/**
 * Schema for the entire taxonomy — every `AgentPermissionClass` key MUST map
 * to a valid `AgentPermissionEntry` whose `class` field matches the key.
 *
 * Used by tests to assert the static map cannot drift from the enum.
 */
export const AgentPermissionTaxonomy = z
  .record(AgentPermissionClass, AgentPermissionEntry)
  .refine((m) => Object.entries(m).every(([k, v]) => v?.class === k), {
    message: 'taxonomy entry class field must match its map key',
  })
export type AgentPermissionTaxonomy = z.infer<typeof AgentPermissionTaxonomy>

/**
 * Derive the permission class from an agent slug by matching its doer-noun
 * suffix against the taxonomy. Returns `null` when the slug does not end in
 * any approved suffix (such agents are caught separately by the
 * slug-namespace doctor row).
 *
 * The match is exact-suffix; the bare-class names (e.g., `orchestrator`)
 * also resolve so an agent slug equal to its class still classifies.
 */
export function classifyAgentSuffix(slug: string): AgentPermissionClass | null {
  const classes = AgentPermissionClass.options
  for (const cls of classes) {
    if (slug === cls || slug.endsWith(`-${cls}`)) {
      return cls
    }
  }
  return null
}

// ─── Workflow argument schema (ANV-0039) ─────────────────────────────────────
/**
 * Typed workflow argument declaration.
 * Arguments declared here are validated and coerced at the boundary before
 * any command is executed — user input is NEVER interpolated into shell strings.
 *
 * `shell-required: true` on an individual argument acts as an explicit opt-in
 * escape hatch for the rare case where the argument value must contain shell
 * metacharacters. The caller then owns escaping; Anvil does not apply
 * metacharacter rejection for those args. Absent or false = safe default.
 */
export const WorkflowArgument = z.object({
  name: z.string().min(1),
  /** Accepted primitive types. No 'array'/'object' — argv elements must be scalars. */
  type: z.enum(['string', 'number', 'boolean']),
  description: z.string().min(1),
  required: z.boolean().default(false),
  /**
   * Explicit escape hatch. When true, shell metacharacters in this argument's
   * value are not rejected — the caller is responsible for safe handling.
   * Default false (safe). Marked with the kebab-case key to match YAML.
   */
  'shell-required': z.boolean().default(false),
})
export type WorkflowArgument = z.infer<typeof WorkflowArgument>

/**
 * A single step in a workflow. Commands are represented as spawn-style argv
 * arrays — never joined into a shell string. This is the primary injection
 * guard: argv[0] is the executable, remaining elements are literal arguments.
 *
 * `shell-required: true` is the explicit escape hatch for steps that genuinely
 * need shell features (pipes, redirection). The flag surfaces in `anvil doctor`
 * and must be paired with `destructive` metadata for any destructive steps
 * (coupling to ANV-0022 approval metadata).
 */
export const WorkflowStep = z.object({
  name: z.string().min(1),
  /** Spawn-style argv — must be a non-empty array; never a string. */
  argv: z.array(z.string()).min(1),
  /**
   * When true, the step's argv is passed to a shell (e.g. `bash -c`).
   * Opt-in only. Surfaces visibly in doctor output.
   * Default false — spawn-style, no shell.
   */
  'shell-required': z.boolean().default(false),
  /**
   * Whether this step has destructive effects (couples to ANV-0022).
   * Destructive shell steps require user approval at runtime.
   * Default false.
   */
  destructive: z.boolean().default(false),
})
export type WorkflowStep = z.infer<typeof WorkflowStep>

/**
 * A complete workflow definition (ANV-0039).
 * Combines a typed argument schema with an ordered list of spawn-style steps.
 * This replaces free-form shell string templates with a structured, injection-safe
 * representation. The `arguments` field declares what the user may supply;
 * `resolveWorkflowArgs` validates and coerces values before they reach any step.
 */
export const WorkflowDefinition = z.object({
  name: z.string().min(1),
  /** Typed argument declarations. Resolved by `resolveWorkflowArgs` before execution. */
  arguments: z.array(WorkflowArgument).default([]),
  /** Ordered steps. Each step's argv is a spawn-style array. */
  steps: z.array(WorkflowStep).min(1),
})
export type WorkflowDefinition = z.infer<typeof WorkflowDefinition>

// ─── Skill schema ───────────────────────────────────────────────────────
export const SkillChain = z.object({
  after: z.string().optional(),
  before: z.string().optional(),
})

export const SkillKind = z.enum(['atomic', 'composite', 'meta'])
export type SkillKind = z.infer<typeof SkillKind>

export const SkillWorkflow = z.object({
  phases: z.array(z.string().min(1)).min(1),
  terminal: z.string().min(1),
})
export type SkillWorkflow = z.infer<typeof SkillWorkflow>

// ─── x-anvil vendor-extension namespace (ANV-0206) ──────────────────────────
// All Anvil-runtime-only frontmatter fields are nested under a single
// `x-anvil:` extension key so host tools (Claude Code, OpenCode) see only
// one unknown key and can ignore or harmlessly passthrough it.
//
// Design decisions:
//   - Key is `x-anvil` (hyphenated) per OpenAPI/JSON-Schema vendor-extension
//     convention. TS access via bracket notation: `data['x-anvil']`.
//   - `.passthrough()` for v0.16 lenient transition; ANV-0209 doctor row will
//     tighten the allowlist toward v0.17.
//   - Composition sub-fields (`sub_skills`, `chains`, `strategy`,
//     `extends_skill`) collapse into `x-anvil.composition`.
//
// Fields kept at root (CC/OC-native, never moved here):
//   name, description, model, permissionMode, color, tools, disallowedTools,
//   skills, memory, mcpServers, hooks, background, isolation, initialPrompt,
//   user-invocable, disable-model-invocation, argument-hint, arguments,
//   allowed-tools, effort, paths, context, agent, license, mode, permission,
//   compatibility, metadata, status.
//
// ANV-0214 (v0.17): preferred_model, preferred_effort, max_tokens, fallback_model
//   were dropped from SkillFrontmatter. Use anvil.toml [assignments] or
//   models.json groups to override resolver behavior per skill.
export const XAnvilCompositionSchema = z
  .object({
    sub_skills: z.array(z.string()).optional(),
    chains: z.array(SkillChain).optional(),
    strategy: z.enum(['replace', 'prepend', 'append', 'wrap']).optional(),
    extends_skill: z.string().min(1).optional(),
    // workflow is excluded — handled by ANV-0255
  })
  .passthrough()
  .optional()
export type XAnvilCompositionSchema = z.infer<typeof XAnvilCompositionSchema>

/**
 * Vendor-extension namespace for Anvil-only frontmatter fields (ANV-0206).
 * Nested under the `x-anvil:` key on both SkillFrontmatter and AgentFrontmatter.
 * .passthrough() allows any unknown sub-fields during the v0.16 transition window.
 */
export const XAnvilSchema = z
  .object({
    // ── Routing / taxonomy ──────────────────────────────────────────────────
    tier: AgentTier.optional(),
    role: z
      .enum(['orchestrator', 'worker', 'verification', 'researcher'])
      .optional(),
    group: z.string().min(1).optional(),
    trigger: z.array(z.string()).optional(),
    kind: z.enum(['atomic', 'composite', 'meta']).optional(),
    language: z.string().optional(),
    tags: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    category: z.string().optional(),
    agent_mode: z.enum(['primary', 'subagent']).optional(),

    // ── Description disambiguation ───────────────────────────────────────
    disambiguator: z.string().optional(),

    // ── Notepad integration ──────────────────────────────────────────────
    notepads_section: z
      .enum([
        'learnings',
        'decisions',
        'issues',
        'verification',
        'problems',
        'large-outputs',
      ])
      .optional(),

    // ── I/O schemas ──────────────────────────────────────────────────────
    output_schema: z.unknown().optional(),
    input_schema: z.unknown().optional(),

    // ── Required reading ─────────────────────────────────────────────────
    required_reading: z.array(z.string().min(1)).optional(),

    // ── Fallback chain ───────────────────────────────────────────────────
    fallback_chain: z.array(z.string()).optional(),

    // ── Model gating ─────────────────────────────────────────────────────
    requires_any_model: z.array(z.string()).optional(),
    requires_provider: z.string().optional(),

    // ── Token budgets ─────────────────────────────────────────────────────
    expected_tokens: z.number().int().nonnegative().optional(),
    max_turns: z.number().int().positive().optional(),

    // ── Versioning ───────────────────────────────────────────────────────
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, 'version must be semver x.y.z')
      .optional(),
    breaking_changes_in: z
      .array(z.string().regex(/^\d+\.\d+\.\d+$/, 'must be semver x.y.z'))
      .optional(),
    replacement: z.string().optional(),

    // ── Provenance ──────────────────────────────────────────────────────
    source: z.enum(['authored', 'generated', 'ported', 'unknown']).optional(),
    confidence: z.number().min(0).max(1).optional(),
    created_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'created_at must be YYYY-MM-DD')
      .optional(),
    provenance: z
      .object({
        author: z.string().optional(),
        amendedFrom: z.string().optional(),
        generatedBy: z.string().optional(),
        lastUpdated: z.string().optional(),
      })
      .optional(),

    // ── Composition ──────────────────────────────────────────────────────
    composition: XAnvilCompositionSchema,

    // ── Assets / references ──────────────────────────────────────────────
    scripts: z.array(z.string().min(1)).optional(),
    references: z.array(z.string().min(1)).optional(),
    assets: z.array(z.string().min(1)).optional(),
    templates: z.array(z.string().min(1)).optional(),

    // ── Runtime ──────────────────────────────────────────────────────────
    activation: z.unknown().optional(),
    mcp_servers: z.unknown().optional(),
    context_providers: z.unknown().optional(),
    eval_fixtures: z.unknown().optional(),
  })
  .passthrough()
export type XAnvilSchema = z.infer<typeof XAnvilSchema>

export const SkillFrontmatter = z
  .object({
    name: z.string().min(1),
    // ANV-0206: kind and group are Anvil-only fields migrated to x-anvil.
    // Made optional at root for v0.16 back-compat transition.
    // Both fields remain readable from x-anvil.kind and x-anvil.group.
    kind: SkillKind.optional(),
    group: z.string().min(1).optional(),
    // ANV-0042 (v0.12.0): cap description at 512 chars (Warp parity).
    // Claude Code silently drops selector keywords past its 1,536-char per-entry
    // cap; 512 keeps Anvil well under that with headroom for prefixing
    // (disambiguator, "Use when...") and aligns with Warp's
    // MAX_SKILL_DESCRIPTION_CHARS=512. Trade-off vs 280 (tweet-shaped): 512
    // accommodates the trigger taxonomy that selectors actually need; the
    // doctor `description-budget` lint warns at 280+ to encourage tightness.
    description: z.string().min(1).max(512),
    trigger: z.array(z.string()).default([]),
    // ANV-0214 (v0.17): preferred_model, preferred_effort, max_tokens,
    // fallback_model were removed from SkillFrontmatter. These fields are
    // silently ignored on load (Zod default strip-mode — see also lines 1363-1368) so external skill
    // authors with old shapes still load without errors. The doctor row
    // (frontmatter-portability) is the authoring gate that fails CI when a
    // new skill declares these fields. Use anvil.toml [assignments] to
    // override resolver behavior per skill.
    /**
     * Author-declared rough estimate of the token cost of loading this skill
     * (frontmatter + body + co-located references, approximated at authoring
     * time). Optional — missing values are treated as "unknown" by the
     * installer's cumulative-budget aggregator (ANV-0114).
     *
     * Contract:
     *   - Non-negative integer (zero is permitted for stub skills).
     *   - No upper bound at schema level; the installer warns when the
     *     selection-wide sum exceeds `compression.expected_tokens_warn`
     *     (default 50,000).
     *   - This is author-declared only; real token counting via tiktoken
     *     is deliberately out of scope for ANV-0114.
     *
     * Doctor surfaces coverage as a non-blocking warn so the field can be
     * adopted gradually without breaking existing skills.
     */
    expected_tokens: z.number().int().nonnegative().optional(),
    tools: z.array(z.string()).default([]),
    chains: z.array(SkillChain).default([]),
    // ── Sub-skill composition (Plan 33 A1) ─────────────────────────────────
    // Ordered list of child skill names this skill orchestrates internally.
    // Tree composition: the parent invokes each child in declared order and
    // merges their outputs. Mutually exclusive with non-empty `chains` —
    // use one composition model per skill.
    sub_skills: z.array(z.string()).optional(),
    workflow: SkillWorkflow.optional(),
    language: z.string().default('universal'),
    tags: z
      .array(
        z.string().refine((t) => !/\s/.test(t), {
          message:
            'tags must be single words (no whitespace); use aliases for multi-word phrases',
        }),
      )
      .default([]),
    aliases: z.array(z.string()).default([]),
    // Legacy Anvil-internal hidden flag (kept for back-compat reads).
    isHidden: z.boolean().default(false),
    tooltip: z.string().optional(),
    license: z.string().optional(),

    // ── CC-native fields (Phase A1) ─────────────────────────────────────
    // Kebab-case keys match the YAML frontmatter as parsed by gray-matter.
    // Zod accepts string-keyed objects, so bracket notation works fine.
    // Defaults match the CC spec:
    //   user-invocable: true  → skill appears in the `/` slash menu
    //   disable-model-invocation: false → skill may be auto-routed
    'user-invocable': z.boolean().default(true),
    'disable-model-invocation': z.boolean().default(false),
    'argument-hint': z.string().optional(),
    /**
     * Typed workflow argument declarations (ANV-0039).
     * Replaces the previous `z.array(z.string())` shape with a typed schema
     * that carries name/type/description/required per CC `arguments:` spec.
     * Values are validated and coerced by `resolveWorkflowArgs` before any
     * command execution — user input is never interpolated into shell strings.
     *
     * Back-compat: skills with no `arguments` field are unaffected (field is
     * optional). Skills declaring the old string-array form will fail Zod
     * validation and surface as a loader error — authors must migrate.
     */
    arguments: z.array(WorkflowArgument).optional(),
    'allowed-tools': z.array(AgentTool).optional(),
    model: z.string().optional(),
    effort: z.string().optional(),

    // ── Per-skill eval fixtures (Plan 30 G2) ───────────────────────────────
    // Inline fixture suite declared in frontmatter. `anvil skill eval <skill>`
    // reads these directly instead of requiring a separate YAML file.
    eval_fixtures: z
      .array(
        z.object({
          name: z.string().min(1),
          prompt: z.string().min(1),
          expected_skills: z.array(z.string()).default([]),
          expected_agent: z.string().optional(),
        }),
      )
      .optional(),

    // ── Skill versioning (Plan 30 G3) ──────────────────────────────────────
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, 'version must be semver x.y.z')
      .optional(),
    breaking_changes_in: z
      .array(z.string().regex(/^\d+\.\d+\.\d+$/, 'must be semver x.y.z'))
      .default([]),
    replacement: z.string().optional(),

    // ── Description disambiguation (Plan 31 C1) ────────────────────────────
    // When set, the loader prefixes `description` with `Anvil's <disambiguator>: <original>`
    // at load time so the skill wins description-collision matches against Claude built-ins.
    // Keep under ~180 chars; the loader rejects values that make the prefix alone ≥200 chars.
    disambiguator: z.string().optional(),

    // ── Notepads section (Plan 31 F2) ─────────────────────────────────────────
    // When set, the skill runtime appends to this notepad section after a
    // successful run via `anvil notepad write`. Headline is extracted from the
    // first H2/H3 in the output, or the first non-empty line ≤80 chars.
    // NOTE: keep in sync with NotepadsSection in src/core/notepads/types.ts.
    // 'large-outputs' added in Plan 32 C6.
    notepads_section: z
      .enum([
        'learnings',
        'decisions',
        'issues',
        'verification',
        'problems',
        'large-outputs',
      ])
      .optional(),

    // ── Output / input schema (Plan 33 B1) ────────────────────────────────
    // Optional Zod-shorthand or JSON-schema shaped object. Validated at the
    // runner boundary. Zod-shorthand: a string naming an exported schema from
    // src/core/types.ts (e.g. "ReviewReport"). JSON-schema: {type, properties,
    // required, ...} accepted for forward compat.
    output_schema: z.unknown().optional(),
    input_schema: z.unknown().optional(),

    // ── Skill provenance schema (Plan 44 Phase A, Item 21) ──────────────────
    // Optional editorial provenance triple: `source` classifies origin, `confidence`
    // scores trust (0..1), `created_at` records first-authored date (YYYY-MM-DD).
    // Loader synthesizes defaults from file path when fields are absent
    // (skills/{universal,languages}/ → 'authored' + 1.0; user dirs → 'unknown').
    // Explicit declarations always win.
    source: SkillProvenanceSource.optional(),
    confidence: z.number().min(0).max(1).optional(),
    created_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'created_at must be YYYY-MM-DD')
      .optional(),

    // ── Structured provenance object (ANV-0058) ───────────────────────────────
    // Richer editorial provenance object that complements the flat `source` /
    // `confidence` / `created_at` triple.  All sub-fields are optional to
    // allow incremental adoption; `lastUpdated` is ISO-8601 datetime
    // (YYYY-MM-DDTHH:mm:ssZ or short YYYY-MM-DD accepted).
    //
    // Doctor lint rules (enforced by `pushSkillProvenanceObjectCheck`):
    //   1. `generatedBy` without `lastUpdated` → warn (incomplete automation trail).
    //   2. Skills whose `source` indicates recent authorship but missing `provenance`
    //      entirely → advisory warn (coverage metric, not a hard failure).
    provenance: z
      .object({
        author: z.string().optional(),
        amendedFrom: z.string().optional(),
        generatedBy: z.string().optional(),
        lastUpdated: z
          .string()
          .regex(
            /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
            'lastUpdated must be ISO-8601 date or datetime',
          )
          .optional(),
      })
      .optional(),

    // ── Path-scoped injection (Plan 39 Phase C, item 10) ────────────────────
    // When set, CC injects this skill's body whenever an Edit/Write/MultiEdit
    // touches a file matching one of the glob patterns. Used by the
    // skills/languages/<lang>/rules/ overlays to deliver per-language guidance
    // exactly when the user is editing a matching file. CC reads `paths:` from
    // the manifest entry; OC ignores it (graceful fall-through to standing
    // instructions).
    //
    // Example: `paths: ["**/*.ts", "**/*.tsx"]` on `coding-style.md` → CC
    // injects the body on every TS/TSX edit; never on `**/*.py` edits.
    paths: z.array(z.string().min(1)).optional(),

    // ── Content-overlay composition (ANV-0092) ──────────────────────────────
    // When a skill carries `strategy:` + `extends_skill:`, the loader runs a
    // composition pass after both skills are loaded. The strategy controls how
    // the override body is merged with the core (base) skill's body:
    //
    //   replace  — ignore the core body; use only the override body.
    //   prepend  — override body + "\n\n" + core body.
    //   append   — core body + "\n\n" + override body.
    //   wrap     — override body with `{CORE_TEMPLATE}` replaced by the core body.
    //
    // `extends_skill` names the core skill slug (must be registered in the
    // same registry).  Provider precedence (ANV-0050) is respected: a lower-rank
    // provider's skill can extend a higher-rank (bundled) core without issue —
    // composition runs after deduplication, operating on the already-won set.
    //
    // These fields are mutually exclusive with `sub_skills` (tree composition)
    // and `chains` (peer pipeline) — enforced by the .refine() below.
    strategy: z
      .enum(['replace', 'prepend', 'append', 'wrap'])
      .optional()
      .describe('Content-overlay composition strategy'),
    extends_skill: z
      .string()
      .min(1)
      .optional()
      .describe('Core skill slug this overlay extends'),

    // ── CC-native context isolation field (ANV-0072) ──────────────────────
    // Controls whether CC creates a fresh conversation context when the skill
    // is invoked:
    //   'inherit' — default; skill shares the caller's context window.
    //   'fork'    — CC spawns a fresh sub-context for this skill. Recommended
    //               for long-running, computationally heavy, or isolatable
    //               skills that should not pollute the caller's context.
    // CC uses 'inherit' when the field is absent.
    context: z.enum(['inherit', 'fork']).optional(),

    // ── CC-native agent delegation field (ANV-0072) ───────────────────────
    // When set, CC delegates execution of this skill to the named agent slug
    // instead of running the skill body inline. Useful for skills that are
    // actually thin wrappers that dispatch to a heavy agent (e.g. a skill
    // named "ultra-execution" that delegates to the "ultra-worker" agent).
    // The value must be a valid agent slug registered in the plugin.
    agent: z.string().min(1).optional(),

    // ── Skill asset declarations (ANV-0086) ───────────────────────────────
    // Optional arrays declaring file paths (absolute or relative to the skill
    // file's directory) that the skill depends on. Doctor checks existence and
    // warns on missing paths. Bundle-friendly: future zip-pack export reads
    // these arrays to include co-located assets.
    //
    //   scripts:    helper scripts the skill body references (e.g. .mjs, .sh).
    //   references: reference documents or specs the skill cites.
    //   assets:     any other supporting files (templates, fixtures, etc.).
    //
    // Paths are checked as-is by the doctor (absolute) or resolved relative to
    // the skill file's directory at load time (relative, when sourcePath is known).
    scripts: z.array(z.string().min(1)).optional(),
    references: z.array(z.string().min(1)).optional(),
    assets: z.array(z.string().min(1)).optional(),

    // ── Activation pre-filter (ANV-0122) ──────────────────────────────────
    // Optional declarative gate evaluated at skill load time. When present,
    // the loader pre-filters skills whose declared activation conditions
    // cannot match the current context (project languages, file globs,
    // available hook events). Skips an LLM round-trip on skills that
    // clearly cannot apply.
    //
    // Author-declared only — Anvil does not auto-infer this block.
    // See `ActivationBlock` (above) for sub-field semantics. A missing
    // `activation` field means "no pre-filter declared" — the skill loads
    // and routes exactly as before (backward-compatible default).
    activation: ActivationBlock.optional(),

    // ── Output / input template references (ANV-0137) ─────────────────────
    // Names of template kinds (subdirectories under `templates/`) whose
    // bodies are spliced into this skill's prose at render time via
    // `${TEMPLATE:<kind>}` substitution. Lenient at render time: unknown
    // kinds pass through verbatim (mirror ANV-0134's policy). The doctor
    // emits a warning when a skill body contains an `${TEMPLATE:foo}`
    // reference but does not list `foo` in this array, or when a body
    // contains the `<!-- template-prose -->` marker but no templates field.
    templates: z.array(z.string().min(1)).optional(),

    // ── Skill MCP servers + context providers (ANV-0037) ──────────────────
    // Optional, additive metadata: a skill may declare MCP servers it relies
    // on, and abstract context providers (memory/codegraph/docs/custom). Anvil
    // declares-only — it does NOT spawn lifecycle for the MCP servers nor
    // wire the context providers. A doctor row validates availability.
    //
    // Sidecar precedent (per GitNexus reference): a sibling `mcp.json` file
    // next to SKILL.md is parsed and merged into `mcp_servers` at load time;
    // sidecar entries win on name collision.
    mcp_servers: z.array(SkillMcpServerRef).optional(),
    context_providers: z.array(ContextProviderRef).optional(),

    // ── Vendor-extension namespace (ANV-0206) ──────────────────────────────
    // All Anvil-runtime-only fields can nest here. Back-compat: existing root
    // fields still parse during the v0.16 transition window. Codemod migrates
    // files; ANV-0209 doctor row will tighten shape in v0.17.
    'x-anvil': XAnvilSchema.optional(),
  })
  // NOTE (Plan 31 H3): .strict() is intentionally NOT applied here.
  // Real skill files may carry CC-native frontmatter fields (e.g. `color:`)
  // that are not in Anvil's SkillFrontmatter schema but are valid for
  // Claude Code. Applying .strict() would cause the loader to reject those
  // skills at parse time. The gray-matter parser passes the raw YAML object
  // to Zod, so unknown CC-native fields must be tolerated (strip-mode).
  .transform((data) => {
    // ANV-0206 back-compat: read Anvil-only fields from x-anvil when not at root.
    // x-anvil.* is the post-migration canonical location; root fields still work
    // for pre-migration files. Consumers always see a value regardless of
    // whether the file is pre- or post-migration.
    const xAnvil = data['x-anvil'] as Record<string, unknown> | undefined
    const xComp = xAnvil?.composition as Record<string, unknown> | undefined

    return {
      ...data,
      // Routing / taxonomy — fall back to x-anvil.
      // Fields with .default([]) use length>0 to distinguish "explicit empty"
      // from "schema default" so fall-through to x-anvil values still works.
      group: data.group ?? (xAnvil?.group as string | undefined),
      kind: (data.kind ?? xAnvil?.kind) as typeof data.kind,
      // language has a default('universal'); if root is still default, fall back to x-anvil.
      language:
        data.language !== 'universal'
          ? data.language
          : ((xAnvil?.language as string | undefined) ?? data.language),
      trigger:
        data.trigger.length > 0
          ? data.trigger
          : ((xAnvil?.trigger as string[]) ?? []),
      tags:
        data.tags.length > 0 ? data.tags : ((xAnvil?.tags as string[]) ?? []),
      aliases:
        data.aliases.length > 0
          ? data.aliases
          : ((xAnvil?.aliases as string[]) ?? []),
      // Composition fields — fall back to x-anvil.composition.
      // chains has a default of [] in the schema; we use length>0 check to distinguish
      // "explicitly empty" (root) from "not present" (so we can fall through to x-anvil).
      sub_skills:
        data.sub_skills ?? (xComp?.sub_skills as string[] | undefined),
      chains:
        data.chains.length > 0
          ? data.chains
          : ((xComp?.chains as typeof data.chains) ?? []),
      strategy: data.strategy ?? (xComp?.strategy as typeof data.strategy),
      extends_skill:
        data.extends_skill ?? (xComp?.extends_skill as string | undefined),
      // Other Anvil fields — fall back to x-anvil.
      // ANV-0206: Gate-1 fix — all Anvil-only fields must fall back from x-anvil
      // so post-migration skill files produce structurally-equivalent parsed objects.
      templates: data.templates ?? (xAnvil?.templates as string[] | undefined),
      // Asset declarations (scripts/references/assets)
      scripts: data.scripts ?? (xAnvil?.scripts as string[] | undefined),
      references:
        data.references ?? (xAnvil?.references as string[] | undefined),
      assets: data.assets ?? (xAnvil?.assets as string[] | undefined),
      // MCP servers — codemod moves these under x-anvil; restore at root for consumers
      mcp_servers:
        data.mcp_servers ?? (xAnvil?.mcp_servers as typeof data.mcp_servers),
      // Activation pre-filter
      activation:
        data.activation ?? (xAnvil?.activation as typeof data.activation),
      // Token budget
      expected_tokens:
        data.expected_tokens ?? (xAnvil?.expected_tokens as number | undefined),
      // I/O schemas
      output_schema: data.output_schema ?? xAnvil?.output_schema,
      input_schema: data.input_schema ?? xAnvil?.input_schema,
      // Notepads section
      notepads_section:
        data.notepads_section ??
        (xAnvil?.notepads_section as typeof data.notepads_section),
      // Versioning + provenance
      version: data.version ?? (xAnvil?.version as string | undefined),
      provenance:
        data.provenance ?? (xAnvil?.provenance as typeof data.provenance),
      // Description disambiguation
      disambiguator:
        data.disambiguator ?? (xAnvil?.disambiguator as string | undefined),
      // Expose CC kebab-case fields under camelCase for ergonomic TS access.
      // The raw kebab-case keys are preserved in the spread above so the
      // serialised shape round-trips cleanly; the camelCase aliases are
      // additive conveniences for TS consumers.
      userInvocable: data['user-invocable'],
      disableModelInvocation: data['disable-model-invocation'],
      argumentHint: data['argument-hint'],
      allowedTools: data['allowed-tools'],
      // Plan 44 Phase A — provenance camelCase aliases. `sourceProvenance`
      // synthesizes 'unknown' when source is absent so consumers always see
      // a value; raw `source` keeps the explicit-vs-default distinction.
      sourceProvenance: data.source ?? 'unknown',
      provenanceConfidence: data.confidence,
      createdAt: data.created_at,
      // ANV-0206 — camelCase alias for the hyphenated `x-anvil` key.
      xAnvil: data['x-anvil'],
    }
  })
  // Plan 33 A1: sub_skills and chains are mutually exclusive.
  // sub_skills = tree composition (skill-driven); chains = peer pipeline (orchestrator-driven).
  // Allowing both on the same skill is incoherent — the runtime would not know
  // which composition model takes priority.
  //
  // ANV-0206: fields may be at root (pre-migration) OR under x-anvil.composition
  // (post-migration). Check both locations for back-compat during the v0.16 window.
  .refine(
    (data) => {
      const comp = (data['x-anvil'] as Record<string, unknown> | undefined)
        ?.composition as Record<string, unknown> | undefined
      const hasSubSkills =
        (Array.isArray(data.sub_skills) && data.sub_skills.length > 0) ||
        (Array.isArray(comp?.sub_skills) &&
          (comp?.sub_skills as unknown[]).length > 0)
      const hasChains =
        (Array.isArray(data.chains) && data.chains.length > 0) ||
        (Array.isArray(comp?.chains) && (comp?.chains as unknown[]).length > 0)
      return !(hasSubSkills && hasChains)
    },
    {
      message: 'sub_skills and chains are mutually exclusive on the same skill',
    },
  )
  // ANV-0092: strategy requires extends_skill (and vice-versa). Both fields
  // are optional, but when either is present the other must also be present.
  // Composition overlays are also mutually exclusive with sub_skills/chains.
  // ANV-0206: same dual-location check for x-anvil.composition fallback.
  .refine(
    (data) => {
      const comp = (data['x-anvil'] as Record<string, unknown> | undefined)
        ?.composition as Record<string, unknown> | undefined
      const hasStrategy =
        data.strategy !== undefined || comp?.strategy !== undefined
      const hasExtends =
        data.extends_skill !== undefined || comp?.extends_skill !== undefined
      return hasStrategy === hasExtends
    },
    {
      message:
        'strategy and extends_skill must both be present or both be absent',
    },
  )
  .refine(
    (data) => {
      const comp = (data['x-anvil'] as Record<string, unknown> | undefined)
        ?.composition as Record<string, unknown> | undefined
      const hasOverlay =
        data.strategy !== undefined ||
        data.extends_skill !== undefined ||
        comp?.strategy !== undefined ||
        comp?.extends_skill !== undefined
      const hasSubSkills =
        (Array.isArray(data.sub_skills) && data.sub_skills.length > 0) ||
        (Array.isArray(comp?.sub_skills) &&
          (comp?.sub_skills as unknown[]).length > 0)
      const hasChains =
        (Array.isArray(data.chains) && data.chains.length > 0) ||
        (Array.isArray(comp?.chains) && (comp?.chains as unknown[]).length > 0)
      return !(hasOverlay && (hasSubSkills || hasChains))
    },
    {
      message:
        'composition overlays (strategy/extends_skill) are mutually exclusive with sub_skills and chains',
    },
  )
export type SkillFrontmatter = z.infer<typeof SkillFrontmatter>

export const Skill = z.object({
  frontmatter: SkillFrontmatter,
  /**
   * The markdown body of the skill (Plan 32 B2).
   * Optional: eager loading always sets this; lazy loading leaves it
   * undefined until the body is first fetched via `getSkillBody()`.
   */
  body: z.string().optional(),
  /**
   * On-demand body loader (Plan 32 B2). Set by lazy loading path; undefined
   * in eager mode. Invoke via `getSkillBody(skill)` — not directly — to get
   * memoisation and error handling.
   */
  bodyLoader: z.function().optional(),
  sourcePath: z.string(),
  tier: z.enum(['universal', 'language', 'user']),
  /**
   * ANV-0123 — physical scope the skill was loaded from.
   *
   *   - 'project'  — `<cwd>/.claude/skills/` or `<cwd>/.opencode/skills/`
   *   - 'home'     — `~/.anvil/skills/`, `~/.claude/skills/`, `~/.opencode/skills/`
   *   - 'bundled'  — shipped inside the Anvil source tree (`skills/`)
   *
   * Defaults to 'bundled' when the loader cannot determine origin (e.g.
   * synthetic test skills constructed in-memory). Real loader paths
   * always set this explicitly. Precedence on slug collision: Project >
   * Home > Bundled (see `src/skills/providers.ts` for the broader provider
   * rank, of which scope is the user-facing projection).
   */
  scope: SkillScope.default('bundled'),
  /**
   * The original description before disambiguator prefixing (Plan 31 C2).
   * Only set when a `disambiguator` is present; undefined otherwise.
   * Load-time-only attribute — not persisted to disk.
   */
  originalDescription: z.string().optional(),
  /**
   * Load-time defect list (Plan 33 A1.b).
   * Populated by the loader when sub_skills references cannot be resolved.
   * Each entry is a human-readable string like `"sub-skill 'foo' not found"`.
   * A skill with non-empty defects is "degraded" — it loads and runs but
   * may be missing sub-skill functionality. Surfaces in `anvil doctor`.
   */
  defects: z.array(z.string()).default([]),
})
export type Skill = z.infer<typeof Skill>

// ─── Sub-skill graph (Plan 33 A2) ───────────────────────────────────────
/**
 * Adjacency list for the sub-skills dependency graph.
 * Built by the loader after all skills are registered.
 * Key: parent skill name; Value: ordered array of sub-skill names.
 * Used for cycle detection (DFS) and for the doctor row.
 */
export const SkillGraph = z.object({
  nodes: z.map(z.string(), z.array(z.string())),
})
export type SkillGraph = z.infer<typeof SkillGraph>

// ─── Agent schema ───────────────────────────────────────────────────────
// agents/*.md files ARE Claude Code subagent definitions. Their frontmatter
// must conform to the Claude Code subagent spec so the shipped plugin can
// install them. Anvil adds a small set of extension fields (role, group,
// trigger, max_turns) that Claude Code ignores but Anvil uses for routing
// and runner budget.

/** Canonical agent role — runtime taxonomy (T3.1). */
export const AgentRole = z.enum([
  'orchestrator',
  'worker',
  'verification',
  'researcher',
])
export type AgentRole = z.infer<typeof AgentRole>

/**
 * Claude Code subagent `model` field. Accepts:
 *   - Provider-neutral aliases: `cheap` | `balanced` | `best` (recommended)
 *   - Anthropic-shorthand legacy: `sonnet` | `opus` | `haiku`
 *   - `inherit` (use parent session's model)
 *   - Full Claude model id (`claude-*-*`)
 *
 * Resolution to a concrete provider model happens in
 * `src/core/models/resolve.ts` via `BUILTIN_MODEL_ALIASES` and the user's
 * `model_aliases` overrides; this Zod schema only validates that the
 * frontmatter value is a known shape.
 */
export const AgentModel = z.union([
  z.enum(['cheap', 'balanced', 'best', 'sonnet', 'opus', 'haiku', 'inherit']),
  z
    .string()
    .regex(
      /^claude-[a-z0-9-]+$/i,
      'must be a keyword or full claude-* model id',
    ),
])
export type AgentModel = z.infer<typeof AgentModel>

/** Claude Code subagent `permissionMode` field. */
export const AgentPermissionMode = z.enum([
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
])
export type AgentPermissionMode = z.infer<typeof AgentPermissionMode>

/** Claude Code subagent `color` field — 8 display colors. */
export const AgentColor = z.enum([
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
])
export type AgentColor = z.infer<typeof AgentColor>

/**
 * MCP server reference inside an agent's frontmatter. Agents may either
 * reference a server already declared elsewhere by name, or define one
 * inline with command + args. Inline declarations let agents stay
 * self-contained without forcing every server to live in a global registry.
 */
export const AgentMcpServerRef = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
  }),
])
export type AgentMcpServerRef = z.infer<typeof AgentMcpServerRef>

/**
 * Persistent memory backing for an agent. `user` and `project` map to
 * shared memory stores; `local` is per-invocation only.
 */
export const AgentMemory = z.enum(['user', 'project', 'local'])
export type AgentMemory = z.infer<typeof AgentMemory>

/**
 * Isolation strategy. Today only `worktree` is recognised — Claude Code
 * spawns the agent inside a fresh git worktree it manages itself. The
 * enum is left open so future modes (e.g. `container`) can be added
 * without a breaking change.
 */
export const AgentIsolation = z.enum(['worktree'])
export type AgentIsolation = z.infer<typeof AgentIsolation>

/**
 * ANV-0206: base ZodObject for AgentFrontmatter, exported separately for
 * introspection (e.g. schema-parity test). The public `AgentFrontmatter`
 * export below applies `.transform(...)` which produces a ZodEffects that
 * doesn't expose `.shape`.
 */
const AgentFrontmatterBaseRaw = z
  .object({
    // ─── Claude Code subagent spec (required + optional) ───────────────────
    name: z.string().min(1),
    description: z.string().min(1),
    /** Defaults to 'inherit' per the CC subagent spec. */
    model: AgentModel.default('inherit'),
    /** Optional on CC; no default applied so an unset field stays unset on disk. */
    permissionMode: AgentPermissionMode.optional(),
    color: AgentColor.optional(),
    tools: AgentTools.default([]),
    /**
     * Deny list applied before the allow list. CC matches deny first, so an
     * agent with `tools: [Read, Edit]` and `disallowedTools: [Edit]` ends up
     * with effective `[Read]`.
     */
    disallowedTools: z.array(AgentTool).optional(),
    /**
     * Skill names whose full body is injected into the agent's context.
     * Anvil resolves these against the loaded skill registry at dispatch
     * time; CC's parser accepts the field verbatim.
     */
    skills: z.array(z.string().min(1)).optional(),
    /** Persistent memory store for this agent. */
    memory: AgentMemory.optional(),
    /**
     * MCP servers — accepts mixed string references and inline definitions.
     */
    mcpServers: z.array(AgentMcpServerRef).optional(),
    /**
     * Per-agent hook overlay. Loose `unknown[]` for v0.4 — the full schema
     * lands with the hook taxonomy expansion in v0.5.
     */
    hooks: z.array(z.unknown()).optional(),
    /** Whether the agent runs as a background task (read-only exploration). */
    background: z.boolean().optional(),
    /** Isolation strategy for the agent's filesystem operations. */
    isolation: AgentIsolation.optional(),
    /** Optional initial prompt to seed the agent on dispatch. */
    initialPrompt: z.string().optional(),

    // ─── Anvil extensions (invisible to Claude Code) ───────────────────────
    /** Agent role for Anvil's internal routing. */
    role: AgentRole.optional(),
    /** Model group (feeds `resolveModel`). */
    group: z.string().min(1).optional(),
    /** Keyword triggers used by the intent router. */
    trigger: z.array(z.string()).default([]),
    /** Runner budget — max conversation turns before abort. */
    max_turns: z.number().int().positive().default(20),

    // ── Description disambiguation (Plan 31 C1) ────────────────────────────
    // When set, the loader prefixes `description` with `Anvil's <disambiguator>: <original>`
    // at load time so the agent wins description-collision matches against Claude built-ins.
    // Keep under ~180 chars; the loader rejects values that make the prefix alone ≥200 chars.
    disambiguator: z.string().optional(),

    // ── Notepads section (Plan 31 F2) ─────────────────────────────────────────
    // When set, the agent runtime appends to this notepad section after a
    // successful run via `anvil notepad write`.
    // NOTE: keep in sync with NotepadsSection in src/core/notepads/types.ts.
    // 'large-outputs' added in Plan 32 C6.
    notepads_section: z
      .enum([
        'learnings',
        'decisions',
        'issues',
        'verification',
        'problems',
        'large-outputs',
      ])
      .optional(),

    // ── Output / input schema (Plan 33 B1) ────────────────────────────────
    // Optional Zod-shorthand or JSON-schema shaped object. Validated at the
    // runner boundary. Zod-shorthand: a string naming an exported schema from
    // src/core/types.ts (e.g. "ReviewReport"). JSON-schema: {type, properties,
    // required, ...} accepted for forward compat.
    output_schema: z.unknown().optional(),
    input_schema: z.unknown().optional(),

    // ── Model resolution v2 extensions (Plan 36 Phase A) ──────────────────
    /**
     * Symbolic tier name; resolved via ModelsConfig.tiers in Phase B.
     * Wins between ENV and group in the 7-layer chain.
     */
    tier: AgentTier.optional(),
    /**
     * Fallback model cascade for this agent.
     * Consumed by the dispatcher on model_not_available / rate_limit errors.
     */
    fallback_chain: z.array(z.string()).default([]),
    /**
     * Whether this agent is a user-facing primary entry point or an internal
     * subagent. Primary agents appear in the top-level slash menu; subagents
     * do not. Default: 'subagent'.
     */
    agent_mode: AgentMode.default('subagent'),
    /** Optional free-form category label for grouping in doctor output. */
    category: z.string().optional(),
    /**
     * Gate: this agent requires at least one of the listed model IDs to be
     * available. The dispatcher emits an explicit error if none are accessible.
     * Checked before dispatch in Phase B.
     */
    requires_any_model: z.array(z.string()).optional(),
    /**
     * Gate: this agent requires a specific provider (e.g. 'anthropic').
     * Checked before dispatch in Phase B.
     */
    requires_provider: z.string().optional(),
    /**
     * Repo-relative paths whose contents are prepended to the subagent prompt
     * at dispatch time as a `<required_reading>` block. Total budget 8 KB
     * across all listed files (REQUIRED_READING_BYTE_CAP); the dispatcher
     * truncates with a marker if the sum exceeds the cap. Plan 43 Phase I (Item 23).
     */
    required_reading: z.array(z.string().min(1)).optional(),

    // ── Expected-token budget hint (ANV-0114) ─────────────────────────────
    // Author-declared rough estimate of the token cost of loading this agent
    // body + any required_reading + skill bodies the agent references.
    // Consumed by the installer's cumulative-budget aggregator to surface a
    // "selected N skills + M agents = ~Xk expected tokens" line before apply.
    // Non-negative integer; zero is permitted. Missing values count toward
    // the installer's "unknown" bucket — backward-compat by design.
    expected_tokens: z.number().int().nonnegative().optional(),

    // ── Vendor-extension namespace (ANV-0206) ──────────────────────────────
    // All Anvil-runtime-only fields can nest here. Back-compat: existing root
    // fields still parse during the v0.16 transition window. Codemod migrates
    // files; ANV-0209 doctor row will tighten shape in v0.17.
    'x-anvil': XAnvilSchema.optional(),
  })
  // Plan 31 H3: .strict() applied — all shipped agent files use only the
  // declared fields above. Rejects unknown-field typos at parse time.
  // If a future CC update adds agent-frontmatter fields we don't know about,
  // remove .strict() from AgentFrontmatter and document the reason here.
  // NOTE (Plan 36 Phase A): new fields above are all declared; .strict() is preserved.
  // NOTE (ANV-0206): x-anvil vendor-extension namespace added; .strict() preserved.
  .strict()
export const AgentFrontmatterBase = AgentFrontmatterBaseRaw
export const AgentFrontmatter = AgentFrontmatterBaseRaw
  // ANV-0206 back-compat: Anvil-only fields migrated under x-anvil so downstream
  // consumers see a consistent shape regardless of whether the file is pre- or
  // post-migration.
  .transform((data) => {
    const xAnvil = data['x-anvil'] as Record<string, unknown> | undefined

    return {
      ...data,
      // Routing / taxonomy
      role: data.role ?? (xAnvil?.role as typeof data.role),
      group: data.group ?? (xAnvil?.group as string | undefined),
      tier: data.tier ?? (xAnvil?.tier as typeof data.tier),
      category: data.category ?? (xAnvil?.category as string | undefined),
      agent_mode:
        data.agent_mode !== 'subagent'
          ? data.agent_mode
          : ((xAnvil?.agent_mode as typeof data.agent_mode) ?? data.agent_mode),
      // I/O schemas
      output_schema: data.output_schema ?? xAnvil?.output_schema,
      input_schema: data.input_schema ?? xAnvil?.input_schema,
      // Required reading / fallback chain
      required_reading:
        data.required_reading ??
        (xAnvil?.required_reading as string[] | undefined),
      fallback_chain:
        data.fallback_chain.length > 0
          ? data.fallback_chain
          : ((xAnvil?.fallback_chain as string[]) ?? []),
      // Model gating
      requires_any_model:
        data.requires_any_model ??
        (xAnvil?.requires_any_model as string[] | undefined),
      requires_provider:
        data.requires_provider ??
        (xAnvil?.requires_provider as string | undefined),
      // Notepads + versioning + provenance
      notepads_section:
        data.notepads_section ??
        (xAnvil?.notepads_section as typeof data.notepads_section),
      expected_tokens:
        data.expected_tokens ?? (xAnvil?.expected_tokens as number | undefined),
      // camelCase alias for the hyphenated key
      xAnvil: data['x-anvil'],
    }
  })
export type AgentFrontmatter = z.infer<typeof AgentFrontmatter>

export const Agent = z.object({
  frontmatter: AgentFrontmatter,
  body: z.string(),
  sourcePath: z.string(),
  /**
   * The original description before disambiguator prefixing (Plan 31 C2).
   * Only set when a `disambiguator` is present; undefined otherwise.
   * Load-time-only attribute — not persisted to disk.
   */
  originalDescription: z.string().optional(),
})
export type Agent = z.infer<typeof Agent>

// ─── Agent handoff (v2) ─────────────────────────────────────────────────
export const HandoffStatus = z.enum([
  'pending',
  'in_progress',
  'done',
  'done_with_concerns',
  'needs_context',
  'blocked',
])
export type HandoffStatus = z.infer<typeof HandoffStatus>

export const HandoffArtifact = z.object({
  name: z.string().min(1),
  kind: z.enum(['file', 'json', 'text']),
  location: z.string().optional(),
})
export type HandoffArtifact = z.infer<typeof HandoffArtifact>

export const AgentHandoff = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  role: AgentRole,
  task: z.object({
    description: z.string().min(1),
    successCriteria: z.array(z.string()).default([]),
    context: z.object({
      files: z.array(z.string()).default([]),
      skills: z.array(z.string()).default([]),
      rules: z.array(z.string()).default([]),
    }),
  }),
  artifacts: z.object({
    required: z.array(HandoffArtifact).default([]),
  }),
  status: HandoffStatus,
  trace: z
    .object({
      startedAt: z.string().datetime().optional(),
      finishedAt: z.string().datetime().optional(),
      model: z.string().optional(),
    })
    .optional(),
})
export type AgentHandoff = z.infer<typeof AgentHandoff>

// ─── Routing decision (v2 — output of src/intent/router.ts) ─────────────
export const RoutingMode = z.enum(['single', 'parallel', 'team'])
export type RoutingMode = z.infer<typeof RoutingMode>

export const RoutingFallback = z.enum(['main', 'ask', 'generic'])
export type RoutingFallback = z.infer<typeof RoutingFallback>

export const SecondaryIntent = z.object({
  intent: z.string().min(1),
  agent: z.string().min(1),
  skills: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
})
export type SecondaryIntent = z.infer<typeof SecondaryIntent>

export const RoutingDecision = z
  .object({
    intent: z.string().min(1),
    confidence: z.number().min(0).max(1),
    agent: z.string().min(1),
    mode: RoutingMode,
    skills: z.array(z.string()).default([]),
    rules: z.object({
      prompt: z.array(z.string()).default([]),
      execution: z.array(z.string()).default([]),
      safety: z.array(z.string()).default([]),
      workflow: z.array(z.string()).default([]),
    }),
    fallback: RoutingFallback.optional(),
    /**
     * Intents that scored within the multi-intent tolerance of the primary.
     * Populated by `buildRoutingDecision` when the second-place intent is
     * subordinate-but-relevant (≥ 60% of primary score). Empty array when
     * routing is genuinely single-intent.
     */
    secondaryIntents: z.array(SecondaryIntent).default([]),
    /**
     * Tie-break candidates when `fallback === 'ask'`. The top two intents are
     * too close to call (within 5%) so the router defers to the user rather
     * than guess. Empty for every other fallback / no-fallback decision.
     */
    candidates: z.array(z.string()).default([]),
    /**
     * Ordered skill names that will run as part of the selected skill's chain
     * (before + entry + after). Populated by `buildRoutingDecision` via
     * `composeChain` when the primary skill declares chain relationships.
     * Empty array when the skill has no chain or chains cannot be resolved.
     */
    chainPreview: z.array(z.string()).default([]),
    /**
     * Phase-resolution directive emitted by the SDD phase matrix (Plan 36 Phase E).
     * Present only when the router has consumed state.json + artifact presence.
     * `kind: 'proceed'` — no SDD redirect needed.
     * `kind: 'redirect'` — user should run `anvil <target>` first.
     * Absent when the router was invoked without a cwd or state-store.
     */
    directive: z
      .object({
        kind: z.enum(['redirect', 'proceed']),
        target: z.enum(['spec', 'plan']).optional(),
        soft: z.boolean(),
        reason: z.string(),
      })
      .optional(),
  })
  // Plan 31 H3: .strict() applied — RoutingDecision is a pure internal
  // type built by the router; all fields are declared above. Rejects typos
  // at parse/validate time (e.g., in tests that call RoutingDecision.parse).
  .strict()
export type RoutingDecision = z.infer<typeof RoutingDecision>

// ─── Hook schema ────────────────────────────────────────────────────────
// HookKind is hoisted to the top of this file (above ModelsConfig) so that
// `disabled.hooks: z.array(HookKind)` can reference it without a TDZ.

// ─── SystemDirective vocabulary (ANV-0049) ───────────────────────────────
/**
 * Typed vocabulary for model-visible system directives (ANV-0049).
 *
 * Each value represents a distinct semantic category of context injection.
 * The dispatcher dedupes by type — at most one directive per type per turn,
 * with the last emitted value for a given type winning.
 *
 * Types:
 *   BOOTSTRAP              — project/session bootstrap context (session-start)
 *   ROUTING_HINT           — skill/agent routing directive (user-prompt-submit)
 *   CONTEXT_WINDOW_MONITOR — context budget warning (context-monitor)
 *   SKILL_REINFORCEMENT    — rules, artifact, or phase guidance (rules-prompt-injector)
 *   ADVISORY               — soft advisory hints (workflow-guard soft violations)
 *   DOCTOR_FINDING         — doctor row findings surfaced to the model
 */
export const SystemDirectiveType = z.enum([
  'BOOTSTRAP',
  'ROUTING_HINT',
  'CONTEXT_WINDOW_MONITOR',
  'SKILL_REINFORCEMENT',
  'ADVISORY',
  'DOCTOR_FINDING',
])
export type SystemDirectiveType = z.infer<typeof SystemDirectiveType>

export const HookContext = z.object({
  kind: HookKind,
  cwd: z.string(),
  config: ModelsConfig,
  env: z.record(z.string(), z.string()),
  payload: z.unknown(),
  /**
   * ANV-0128 — active profile name resolved by the dispatcher for the
   * currently-invoked handler. When set, the handler MAY branch on this
   * value to switch between operating modes (e.g., minimal/balanced/strict).
   * Absent when the handler did not declare a profile manifest or when
   * neither config nor defaultProfile produced a name (legacy behavior).
   */
  profile: z.string().optional(),
})
export type HookContext = z.infer<typeof HookContext>

/**
 * ANV-0128 — per-profile configuration payload for a hook handler.
 *
 * The shape is intentionally opaque (`Record<string, unknown>`): each handler
 * defines its own profile schema and reads the fields it cares about. The
 * dispatcher only routes the active profile name into `ctx.profile`; it does
 * NOT inspect the payload itself.
 *
 * Empty object profiles are valid — they signal "this profile name is
 * recognised; behavior is encoded in the handler closure".
 */
export const ProfileConfig = z.record(z.string(), z.unknown())
export type ProfileConfig = z.infer<typeof ProfileConfig>

/**
 * ANV-0128 — profile manifest attached to a hook handler that advertises
 * multiple operating modes.
 *
 * A handler MAY export a `HookHandlerProfileManifest` alongside its handler
 * function. The manifest declares the set of named profiles the handler
 * understands and which one is active by default. The dispatcher resolves
 * the active profile per call:
 *
 *   1. `config.hooks.<handler-name>.profile` (user override).
 *   2. `manifest.defaultProfile` (handler default).
 *   3. undefined (legacy behavior — handler runs with no profile set).
 *
 * Handlers WITHOUT a manifest continue to work unchanged.
 */
export const HookHandlerProfileManifest = z.object({
  /** Named profiles the handler advertises (`minimal`, `balanced`, `strict`, etc.). */
  profiles: z.record(z.string(), ProfileConfig),
  /** Profile applied when config does not override. Must exist in `profiles`. */
  defaultProfile: z.string().optional(),
})
export type HookHandlerProfileManifest = z.infer<
  typeof HookHandlerProfileManifest
>

export const HookResult = z
  .object({
    exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    /** User-visible text; written to stdout by the hook entrypoint. */
    message: z.string().optional(),
    /**
     * Model-visible text (Plan 31 B1 — Path E injection).
     * The adapter translates this to the platform-native injection mechanism:
     *   - Claude Code: `hookSpecificOutput.additionalContext` (10KB cap)
     *   - OpenCode: prepended system-role message via `transform()` + disk-backed
     *               `.anvil/active-routing.json` for cross-turn persistence.
     * Never written to stdout directly; `message` handles the user-visible channel.
     */
    systemInsert: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  // Plan 31 H3: .strict() applied — HookResult is an internal boundary
  // shape; all handlers return only the declared fields. Rejects typos.
  .strict()
export type HookResult = z.infer<typeof HookResult>

export type HookHandler = (ctx: HookContext) => Promise<HookResult>

// ─── MCP elicitation events + handler type (ANV-0037) ───────────────────
/**
 * MCP `Elicitation` event payload, fired by an MCP server when it needs
 * human input mid-tool-call. Mirrors the upstream MCP spec; Anvil only
 * carries the type contract — actual subscription wiring is handled by
 * the host runtime.
 */
export const Elicitation = z.object({
  type: z.literal('elicitation'),
  serverName: z.string().min(1),
  toolName: z.string().min(1),
  prompt: z.string().min(1),
  /** Optional JSON-schema-ish hints for the host UI. */
  schema: z.record(z.string(), z.unknown()).optional(),
})
export type Elicitation = z.infer<typeof Elicitation>

/** Result returned by the host after the user satisfies an Elicitation. */
export const ElicitationResult = z.object({
  type: z.literal('elicitation-result'),
  serverName: z.string().min(1),
  toolName: z.string().min(1),
  /** When `cancelled` is true, `value` is ignored. */
  cancelled: z.boolean().default(false),
  value: z.unknown().optional(),
})
export type ElicitationResult = z.infer<typeof ElicitationResult>

/**
 * Discriminator enum for tool-handler kinds (ANV-0037). `mcp_tool` is the
 * new entry representing a tool surfaced by an MCP server (as distinct
 * from `builtin` tools wired into the host runtime).
 */
export const ToolHandlerKind = z.enum(['builtin', 'mcp_tool'])
export type ToolHandlerKind = z.infer<typeof ToolHandlerKind>

/** Lightweight subscription handle returned by elicitation event registration. */
export interface ElicitationSubscription {
  unsubscribe(): void
}
export type ElicitationHandler = (
  event: Elicitation,
) => Promise<ElicitationResult> | ElicitationResult

// ─── on-large-output hook contract (Plan 32 C1) ─────────────────────────
/**
 * Payload for the `on-large-output` hook.
 * Injected by the dispatcher whenever a tool result exceeds the configured
 * `compression.threshold_words` threshold.
 */
export const LargeOutputPayload = z.object({
  toolName: z.string(),
  toolResult: z.string(),
  words: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  branch: z.string(),
  cwd: z.string(),
})
export type LargeOutputPayload = z.infer<typeof LargeOutputPayload>

/**
 * Return value from an `on-large-output` handler.
 * - `summary` set → dispatcher replaces the tool result in context with
 *   the summary plus `see notepad: <stashedAt>`.
 * - `skip: true` → dispatcher leaves the original output intact.
 * - Both absent → falls through to skip (safe default).
 */
export const LargeOutputResult = z.object({
  summary: z.string().optional(),
  stashedAt: z.string().optional(),
  skip: z.boolean().optional(),
})
export type LargeOutputResult = z.infer<typeof LargeOutputResult>

// ─── Project context ────────────────────────────────────────────────────
export const DetectedLanguage = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
})

export const ProjectContext = z.object({
  languages: z.array(DetectedLanguage),
  frameworks: z.array(z.string()).default([]),
  testRunners: z.array(z.string()).default([]),
  packageManager: z.string().optional(),
  ci: z.array(z.string()).default([]),
  detectedAt: z.string().datetime(),
})
export type ProjectContext = z.infer<typeof ProjectContext>

// ─── Command safety annotations (ANV-0022) ─────────────────────────────────
//
// MCP-SDK canonical 4-tuple verbatim. Applied to every Anvil CLI/slash command
// so the doctor row can verify coverage and so MCP hosts can make informed
// decisions when presenting commands to users.
//
// Field semantics (straight from MCP SDK):
//   readOnlyHint    — true when the command has no persistent side-effects.
//   destructiveHint — true when the command may destroy data (only meaningful
//                     when readOnlyHint=false).
//   idempotentHint  — true when running the command multiple times produces
//                     the same result as running it once.
//   openWorldHint   — true when the command may contact external systems
//                     (network, external APIs, etc.).
//
// Constraint: readOnlyHint=true and destructiveHint=true together are
// contradictory; the doctor row surfaces this as a fail.

export const CommandSafetyAnnotations = z.object({
  /** True when the command produces no persistent side-effects. */
  readOnlyHint: z.boolean(),
  /**
   * True when the command may irreversibly destroy or overwrite data.
   * Only meaningful when readOnlyHint=false.
   */
  destructiveHint: z.boolean(),
  /**
   * True when running the command N times has the same effect as running it
   * once (e.g., `anvil doctor` — any number of runs leaves the system
   * unchanged).
   */
  idempotentHint: z.boolean(),
  /**
   * True when the command may contact external systems (network, APIs, git
   * remotes, etc.).
   */
  openWorldHint: z.boolean(),
})
export type CommandSafetyAnnotations = z.infer<typeof CommandSafetyAnnotations>

/**
 * A single registered Anvil command with its MCP-canonical safety annotation.
 */
export const CommandRegistryEntry = z.object({
  /** Canonical command name as registered with Commander (e.g. "init", "doctor"). */
  name: z.string().min(1),
  /** One-line description matching the Commander .description() string. */
  description: z.string().min(1),
  safety: CommandSafetyAnnotations,
})
export type CommandRegistryEntry = z.infer<typeof CommandRegistryEntry>

// ─── Preset names ───────────────────────────────────────────────────────
export const PresetName = z.enum([
  'balanced',
  'cost-optimised',
  'max-quality',
  'speed-first',
])
export type PresetName = z.infer<typeof PresetName>

// ─── Scope ──────────────────────────────────────────────────────────────
export const Scope = z.enum(['project', 'global'])
export type Scope = z.infer<typeof Scope>

// ─── Target platform ────────────────────────────────────────────────────
export const Target = z.enum(['claude-code', 'opencode', 'both'])
export type Target = z.infer<typeof Target>

// ─── Review findings (code-reviewer agent output, two-stage) ────────────
export const ReviewType = z.enum(['spec-compliance', 'code-quality'])
export type ReviewType = z.infer<typeof ReviewType>

export const ReviewSeverity = z.enum(['critical', 'important', 'suggestion'])
export type ReviewSeverity = z.infer<typeof ReviewSeverity>

export const ReviewFinding = z.object({
  review_type: ReviewType,
  severity: ReviewSeverity,
  confidence: z.number().int().min(0).max(100),
  file: z.string().min(1),
  line: z.number().int().nonnegative().optional(),
  category: z.enum([
    'bug',
    'security',
    'performance',
    'correctness',
    'architecture-violation',
    'convention',
    'spec-gap',
    'scope-creep',
  ]),
  message: z.string().min(1),
  fix: z.string().optional(),
  spec_ref: z.string().optional(),
})
export type ReviewFinding = z.infer<typeof ReviewFinding>

export const ReviewPass = z.object({
  passed: z.boolean(),
  findings: z.array(ReviewFinding).default([]),
  skipped: z.boolean().default(false),
})
export type ReviewPass = z.infer<typeof ReviewPass>

export const ReviewReport = z.object({
  spec_compliance: ReviewPass,
  code_quality: ReviewPass,
  min_confidence: z.number().int().min(0).max(100).default(80),
})
export type ReviewReport = z.infer<typeof ReviewReport>

// ─── Plan auditor report (plan-verifier agent structured output) ────────────
export const PlanGapKind = z.enum([
  'missing-requirement',
  'scope-creep',
  'ambiguous-acceptance',
  'unmapped-task',
  'dependency-violation',
  'broken-reference',
  'hidden-intention',
  'missing-edge-case',
])
export type PlanGapKind = z.infer<typeof PlanGapKind>

export const PlanGap = z.object({
  kind: PlanGapKind,
  severity: z.enum(['critical', 'important', 'suggestion']),
  message: z.string().min(1),
  task_ref: z.string().optional(),
  spec_ref: z.string().optional(),
})
export type PlanGap = z.infer<typeof PlanGap>

export const PlanAuditReport = z.object({
  verdict: z.enum(['pass', 'fail']),
  plan_path: z.string().min(1),
  spec_path: z.string().optional(),
  gaps: z.array(PlanGap).default([]),
  requirements_total: z.number().int().nonnegative(),
  requirements_covered: z.number().int().nonnegative(),
})
export type PlanAuditReport = z.infer<typeof PlanAuditReport>

// ─── Validation map (Nyquist test-coverage gate) ────────────────────────
export const ValidationAssertion = z.object({
  description: z.string().min(1),
  expected_signal: z.string().optional(), // e.g. "exit code 0", "no diff", "log contains X"
})
export type ValidationAssertion = z.infer<typeof ValidationAssertion>

export const ValidationEntry = z.object({
  task_id: z.string().min(1), // matches plan task heading anchor
  test_command: z.string().min(1), // e.g. "npm test -- src/foo.test.ts"
  file_paths: z.array(z.string()).default([]),
  assertions: z.array(ValidationAssertion).default([]),
})
export type ValidationEntry = z.infer<typeof ValidationEntry>

export const ValidationMap = z.object({
  plan_path: z.string().min(1),
  generated_at: z.string().datetime(),
  detected_runners: z.array(z.string()).default([]),
  entries: z.array(ValidationEntry).default([]),
  uncovered_tasks: z.array(z.string()).default([]),
})
export type ValidationMap = z.infer<typeof ValidationMap>

// ─── Decision coverage (plan/spec decisions block) ───────────────────────────

export const Decision = z.object({
  id: z.string().min(1), // e.g. "D-001" or "review-vocab"
  title: z.string().min(1),
  rationale: z.string().min(1),
})
export type Decision = z.infer<typeof Decision>

export const DecisionsBlock = z.object({
  source_path: z.string().min(1), // plan or spec markdown path
  decisions: z.array(Decision).default([]),
})
export type DecisionsBlock = z.infer<typeof DecisionsBlock>

export const DecisionCoverageReport = z.object({
  source_path: z.string().min(1),
  total: z.number().int().nonnegative(),
  covered_ids: z.array(z.string()).default([]),
  uncovered_ids: z.array(z.string()).default([]),
  passed: z.boolean(),
})
export type DecisionCoverageReport = z.infer<typeof DecisionCoverageReport>

// ─── Anvil project config (anvil.json) ─────────────────────────────────────
// Per-project configuration stored in `.anvil/anvil.json` (distinct from
// `models.json` which is reserved for the 5-layer model resolution chain).
// This file is for feature-level configuration that is not model-resolution.

export const AnvilNotepadsConfig = z.object({
  /**
   * Token budget profile for notepad auto-loading at SessionStart.
   *   minimal  → ≤200 tokens (top ~6 entries)
   *   standard → ≤500 tokens (top 12-15 entries)  [default]
   *   strict   → ≤1000 tokens (full recent-context)
   */
  profile: z.enum(['minimal', 'standard', 'strict']).default('standard'),
})
export type AnvilNotepadsConfig = z.infer<typeof AnvilNotepadsConfig>

/**
 * Anvil project configuration (`.anvil/anvil.json`).
 * Separate from `models.json`; holds feature-level settings.
 */
export const AnvilConfig = z.object({
  $schema: z.string().optional(),
  notepads: AnvilNotepadsConfig.optional(),
})
export type AnvilConfig = z.infer<typeof AnvilConfig>

// ─── Workflow config (Plan 36 Phase A) ──────────────────────────────────────

/**
 * Per-feature workflow gate toggles. Stored in `.anvil/features/<slug>/anvil.json`
 * or globally in `.anvil/anvil.json`. All flags default to conservative values
 * matching the v0.9.x behaviour.
 */
export const WorkflowConfig = z.object({
  /** Blocks `anvil plan` when spec.md has non-empty `## Open Questions`. Default false. */
  research_gate: z.boolean().default(false),
  /** Enables structured plan frontmatter validation on `anvil plan`. Default true. */
  plan_check: z.boolean().default(true),
  /** Enables D-NN: decision-coverage gate in `plan-verifier`. Default true. */
  decision_coverage: z.boolean().default(true),
  /** Enables plan-verifier run after plan generation. Default true. */
  verification: z.boolean().default(true),
  /** Enables context-bridge context-coverage checks. Default false. */
  context_coverage: z.boolean().default(false),
  /**
   * Enables GateGuard PreToolUse handler — blocks first Edit|Write|MultiEdit per file
   * until 4 facts have been observed (importers gathered, API surface read, schema
   * referenced, user instruction present). Default false (opt-in).
   * Also enabled transiently when ANVIL_GATEGUARD=1 is set (set by --strict on
   * review/plan/debug/ultra/spec commands).
   */
  gateguard: z.boolean().default(false),
  /**
   * Plan 44 Phase H — Reactive `runtime-fallback` hook (Item 14).
   * When true, the dispatcher registers `src/hooks/handlers/runtime-fallback.ts`
   * on the `on-error` event. The handler advances `fallback_chain` on
   * `model_not_available` / `rate_limit_exceeded` codes, reusing the
   * proactive consumer's budget (RUNTIME_FALLBACK_MAX_RETRIES = 2).
   * Default false (opt-in); also enabled by ANVIL_RUNTIME_FALLBACK=1.
   */
  runtime_fallback: z.boolean().default(false),
  /**
   * Plan 45 / v0.11.0 — agent-redirect PreToolUse hook (D-10 / D-11).
   * When true, the dispatcher's pre-tool-use multiplexer denies Task/Agent
   * dispatch with `subagent_type: "anvil:<slug>"` if `<slug>` resolves to a
   * registered skill rather than an agent. Unknown slugs allowed (typo
   * tolerance per D-10). Default false (opt-in).
   */
  agent_redirect: z.boolean().default(false),
})
export type WorkflowConfig = z.infer<typeof WorkflowConfig>

// ─── SDD artifact schemas (Plan 36 Phase A) ──────────────────────────────────

/**
 * must_haves block inside PlanFrontmatter.
 * Captures the non-negotiable output contracts for the plan.
 */
export const MustHaves = z.object({
  /** Invariants that must remain true after implementation. */
  truths: z.array(z.string()),
  /** Files that must exist, optionally with structural constraints. */
  artifacts: z.array(
    z.object({
      path: z.string(),
      provides: z.string().optional(),
      min_lines: z.number().int().nonnegative().optional(),
      exports: z.array(z.string()).optional(),
      contains: z.array(z.string()).optional(),
    }),
  ),
  /** Canonical links (spec paths, ADR paths, issue URLs) referenced by this plan. */
  key_links: z.array(z.string()),
  /**
   * D-NN: decision IDs from the spec that this plan covers.
   * Populated by the plan-writing; verified by plan-verifier.
   */
  covered_decisions: z.array(z.string()).optional(),
})
export type MustHaves = z.infer<typeof MustHaves>

/**
 * Full frontmatter schema for plan.md files (.anvil/specs/features/<slug>/plan.md).
 */
export const PlanFrontmatter = z.object({
  title: z.string(),
  feature_slug: z.string(),
  version: z.string(),
  must_haves: MustHaves,
  phases: z.array(z.object({ name: z.string(), goal: z.string() })),
  dependencies: z.array(z.string()).default([]),
  validation: z.object({
    tests: z.array(z.string()),
    commands: z.array(z.string()),
  }),
})
export type PlanFrontmatter = z.infer<typeof PlanFrontmatter>

/**
 * Full frontmatter schema for spec.md files (.anvil/specs/features/<slug>/spec.md).
 */
export const SpecFrontmatter = z.object({
  title: z.string(),
  feature_slug: z.string(),
  version: z.string(),
  /** ISO date string (YYYY-MM-DD or full ISO 8601). */
  created: z.string(),
  status: z.enum(['draft', 'approved', 'superseded']).default('draft'),
})
export type SpecFrontmatter = z.infer<typeof SpecFrontmatter>

// ─── Anvil runtime state (Plan 36 Phase A) ───────────────────────────────────

/**
 * Collapsed runtime state schema (replaces the split progress.json + state.json).
 * Written to `.anvil/state.json` per feature.
 */
export const AnvilState = z.object({
  /** Literal 1 — bump when the shape changes. */
  schema_version: z.literal(1),
  /** The feature being actively worked on. */
  feature_slug: z.string().optional(),
  /** Current workflow phase. */
  phase: z
    .enum([
      'research',
      'spec',
      'plan',
      'tasks',
      'implement',
      'verify',
      'review',
      'finish',
      'none',
    ])
    .default('none'),
  /** The task currently in progress. */
  current_task: z.string().optional(),
  /** Task names that have been completed. */
  completed_tasks: z.array(z.string()).default([]),
  /** Task names remaining. */
  pending_tasks: z.array(z.string()).default([]),
  /** Last CLI command that mutated state. */
  last_command: z.string().optional(),
  /** ISO 8601 timestamp of last write. */
  updated_at: z.string(),
})
export type AnvilState = z.infer<typeof AnvilState>

// ─── Schema field parser (Plan 33 B1) ──────────────────────────────────────
/**
 * Named schemas that can be referenced by Zod-shorthand strings in
 * `output_schema` / `input_schema` frontmatter fields. The name must
 * exactly match an exported Zod schema from this module.
 */
const NAMED_SCHEMAS: Record<string, z.ZodTypeAny> = {
  ReviewReport,
  ReviewPass,
  ReviewFinding,
  PlanAuditReport,
  PlanGap,
}

/**
 * Resolves a raw `output_schema` / `input_schema` frontmatter value to a Zod
 * validator, or returns `undefined` when no schema is declared.
 *
 * Accepted forms:
 *   - `undefined` / absent → `undefined` (no validation)
 *   - `"ReviewReport"` (string) → named Zod schema from this module
 *   - `{type, properties, required, ...}` (object) → treated as JSON-schema;
 *     validated structurally with `z.unknown()` (full JSON-schema→Zod
 *     conversion is deferred to v0.9 when the schema diversity grows)
 */
export function parseSchemaField(raw: unknown): z.ZodTypeAny | undefined {
  if (raw === undefined || raw === null) return undefined

  if (typeof raw === 'string') {
    const schema = NAMED_SCHEMAS[raw]
    if (!schema) {
      throw new Error(
        `Unknown schema shorthand "${raw}". Known schemas: ${Object.keys(NAMED_SCHEMAS).join(', ')}`,
      )
    }
    return schema
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    // JSON-schema object: accepted but stored as z.unknown() for now.
    // Full JSON-schema → Zod conversion tracked as v0.9 work.
    return z.unknown()
  }

  throw new Error(
    `Invalid schema field value: expected a string name or JSON-schema object, got ${typeof raw}`,
  )
}

// ─── Anvil home manifest (ANV-0014, ANV-0065) ─────────────────────────────────
//
// Versioned schema for ~/.anvil/manifest.json. Written by the installer at
// staging time; read by the OpenCode plugin to discover enabled skills.
// `schemaVersion: "anvil.opencode.v1"` is the contract identifier — any
// plugin-side reader must validate this field before processing `skills`.

export const AnvilHomeManifestSkill = z.object({
  /** Skill slug / directory name under ~/.anvil/skills/. */
  name: z.string().min(1),
  /** Whether this skill is active for the current install. */
  enabled: z.boolean(),
  /** Absolute path to the skill source file (SKILL.md). */
  sourcePath: z.string().min(1),
  /** Absolute path to the generated skill file in the installed layout, if different. */
  generatedPath: z.string().optional(),
  /** Whether the skill is user-invocable (visible in the slash menu). */
  public: z.boolean().optional(),
  /** SHA-256 hex checksum of sourcePath at install time. */
  checksum: z.string().optional(),
})
export type AnvilHomeManifestSkill = z.infer<typeof AnvilHomeManifestSkill>

export const AnvilHomeManifest = z.object({
  /** Schema version identifier — plugin readers MUST assert this exact string. */
  schemaVersion: z.literal('anvil.opencode.v1'),
  /** Semver of the anvil CLI that wrote this manifest. */
  anvilVersion: z.string().optional(),
  /** Install target recorded at last `anvil init`. */
  installedTarget: z.enum(['claude-code', 'opencode', 'both']),
  /** ISO 8601 timestamp of the last install. */
  installedAt: z.string(),
  /** Skill entries staged at install time. */
  skills: z.array(AnvilHomeManifestSkill),
})
export type AnvilHomeManifest = z.infer<typeof AnvilHomeManifest>

// ─── Manifest read result (v0.10.9 E-003) ────────────────────────────────
//
// Discriminated result for readers of optional manifest files. Distinguishes
// "the file is legitimately absent" from "the file is present but malformed",
// so callers can suppress noise on the absent case while surfacing the
// corrupt case as a real warning. Internal return shape only — not parsed
// at a boundary, so no Zod schema.
//
// Variants:
//   { present: false }                 — file does not exist
//   { present: true; error: string }   — file exists but malformed/unreadable
//   { present: true; value: T }        — file parsed successfully
export type ManifestReadResult<T> =
  | { present: false }
  | { present: true; error: string }
  | { present: true; value: T }
