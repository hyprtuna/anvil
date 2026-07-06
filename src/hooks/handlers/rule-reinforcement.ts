/**
 * UserPromptSubmit handler — rule reinforcement (ANV-0124).
 *
 * Long sessions drift away from project conventions documented in CLAUDE.md /
 * skills and the active routing rules. This handler reinjects a compact
 * "rules of the road" reminder under a `<rule-reinforcement>` envelope when:
 *
 *   1. The turn counter has advanced `every_n_turns` since the last inject
 *      (default 20).
 *   2. The current prompt matches one of the keyword triggers (default:
 *      `"let's just"`, `"skip the"`, `"for now"`, `"just do it"`).
 *
 * Disable via `reinforcement.disable = true` in models.json OR the env
 * var `ANVIL_DISABLE_REINFORCEMENT=1`. When disabled the handler is a no-op.
 *
 * Token budget is enforced via the shared-budget reservation
 * (`reinforcementCharBudget`) so this handler cannot starve the SessionStart
 * fragment aggregator. The compact digest reuses `compactStructuralSections`
 * from ANV-0118 so structural sections are elided before raw truncation.
 *
 * Layered architecture: hook handler (layer 2) imports core + hook siblings
 * only — no upward imports.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../core/io/project-scoped-paths.js'
import { safeWrite } from '../../core/io/safe-write.js'
import { findProjectRoot } from '../../core/project/root.js'
import type { HookHandler } from '../../core/types.js'
import { createSystemDirective } from '../system-directive.js'
import {
  DEFAULT_STARTUP_SECTION_PRIORITIES,
  compactStructuralSections,
} from './session-start/compaction.js'
import { reinforcementCharBudget } from './session-start/shared-budget.js'
import { extractPrompt } from './user-prompt-submit/payload.js'

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Default cadence: inject every N turns. */
export const DEFAULT_EVERY_N_TURNS = 20

/**
 * Default keyword triggers — phrases that historically correlate with the
 * model abandoning conventions. Match is case-insensitive on raw prompt text.
 */
export const DEFAULT_KEYWORD_TRIGGERS: readonly string[] = [
  "let's just",
  'skip the',
  'for now',
  'just do it',
]

/** Default per-inject token cap (~500 tokens ≈ 2000 chars). */
export const DEFAULT_REINFORCEMENT_TOKENS = 500

/** Sidecar file used to persist the running turn counter. */
const TURN_COUNTER_FILE = 'rule-reinforcement-counter.json'

// ─── Config shape ────────────────────────────────────────────────────────────

/**
 * Zod schema for `reinforcement` block in models.json. All fields optional —
 * unset values fall back to module-level defaults.
 */
const ReinforcementConfig = z
  .object({
    every_n_turns: z.number().int().positive().optional(),
    keyword_triggers: z.array(z.string()).optional(),
    disable: z.boolean().optional(),
    token_budget: z.number().int().nonnegative().optional(),
  })
  .partial()
export type ReinforcementConfig = z.infer<typeof ReinforcementConfig>

// ─── Counter persistence ─────────────────────────────────────────────────────

const CounterFile = z.object({
  turns: z.number().int().nonnegative(),
  last_injected_at_turn: z.number().int().nonnegative(),
})
type CounterFile = z.infer<typeof CounterFile>

function readCounter(counterPath: string): CounterFile {
  if (!existsSync(counterPath)) {
    return { turns: 0, last_injected_at_turn: 0 }
  }
  try {
    const raw = readFileSync(counterPath, 'utf-8')
    const parsed = CounterFile.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // Corrupt counter file — best-effort, start fresh.
  }
  return { turns: 0, last_injected_at_turn: 0 }
}

function writeCounter(counterPath: string, state: CounterFile): void {
  try {
    mkdirSync(dirname(counterPath), { recursive: true })
    safeWrite(counterPath, JSON.stringify(state, null, 2), {
      maxBytes: 16 * 1024,
    })
  } catch {
    // Best-effort — never block the prompt on counter persistence errors.
  }
}

// ─── Digest assembly ─────────────────────────────────────────────────────────

/**
 * Resolve registered skill + agent names from the per-project registry.json.
 * When the registry is missing or unreadable, returns empty arrays so the
 * digest still emits the routing-rules portion.
 */
async function readRegistry(projectRoot: string): Promise<{
  skills: string[]
  agents: string[]
}> {
  try {
    await ensureProjectDir(projectRoot)
    const path = await getProjectScopedPath(projectRoot, 'registry')
    if (!existsSync(path)) return { skills: [], agents: [] }
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as { skills?: unknown; agents?: unknown }
    const skills = Array.isArray(parsed.skills)
      ? parsed.skills.filter((s): s is string => typeof s === 'string')
      : []
    const agents = Array.isArray(parsed.agents)
      ? parsed.agents.filter((s): s is string => typeof s === 'string')
      : []
    return { skills, agents }
  } catch {
    return { skills: [], agents: [] }
  }
}

/**
 * Assemble the rule-reinforcement digest body. Sections are emitted in
 * priority order; downstream compaction elides lower-priority sections
 * first when the budget is tight.
 */
export function buildReinforcementDigest(
  skills: readonly string[],
  agents: readonly string[],
): string {
  const lines: string[] = []
  lines.push('Reminder: project conventions still apply this turn.')
  lines.push('')
  lines.push(
    '<routing_rules>Pick the most specific Anvil skill/agent for the user intent. When in doubt prefer high-precision tools (debug, test, review) over inline edits.</routing_rules>',
  )
  if (skills.length > 0) {
    lines.push(`<anvil_skills>${skills.join(', ')}</anvil_skills>`)
  }
  if (agents.length > 0) {
    lines.push(`<anvil_agents>${agents.join(', ')}</anvil_agents>`)
  }
  return lines.join('\n')
}

/**
 * Wrap the digest body in the user-grep-friendly envelope. Both users and
 * models can search transcript output for `<rule-reinforcement>` to find
 * every injection point.
 */
export function wrapInEnvelope(body: string): string {
  return `<rule-reinforcement>\n${body}\n</rule-reinforcement>`
}

// ─── Keyword trigger detection ───────────────────────────────────────────────

/**
 * Case-insensitive substring match against the configured trigger list.
 * Empty / whitespace prompt is never a trigger.
 */
export function matchesKeywordTrigger(
  prompt: string,
  triggers: readonly string[],
): boolean {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return false
  const lower = prompt.toLowerCase()
  return triggers.some((t) => {
    if (typeof t !== 'string' || t.length === 0) return false
    return lower.includes(t.toLowerCase())
  })
}

// ─── Decision helper ─────────────────────────────────────────────────────────

/** Why the handler decided to inject (debug helper). */
export type InjectReason = 'cadence' | 'keyword' | 'none'

/**
 * Pure decision function — given the running counter and the prompt, decide
 * whether this turn should fire a reinforcement injection.
 */
export function decideInject(opts: {
  prompt: string
  counter: CounterFile
  everyNTurns: number
  triggers: readonly string[]
}): { inject: boolean; reason: InjectReason } {
  if (matchesKeywordTrigger(opts.prompt, opts.triggers)) {
    return { inject: true, reason: 'keyword' }
  }
  const sinceLast = opts.counter.turns - opts.counter.last_injected_at_turn
  // Use >= so the first turn after enabling fires once the configured
  // cadence has elapsed. Skip when last_injected_at_turn equals turns (the
  // injection we just made).
  if (opts.counter.turns > 0 && sinceLast >= opts.everyNTurns) {
    return { inject: true, reason: 'cadence' }
  }
  return { inject: false, reason: 'none' }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Resolve the counter sidecar path. Per-project under `.anvil/runtime/`.
 * Sidecar housekeeping with ANV-0126 — both features write under
 * `.anvil/runtime/`.
 */
function counterPathFor(projectRoot: string): string {
  return join(projectRoot, '.anvil', 'runtime', TURN_COUNTER_FILE)
}

function readConfig(config: unknown): ReinforcementConfig {
  // Config is the Zod-validated ModelsConfig; the `reinforcement` block may
  // not be present (it lives on a passthrough field at runtime).
  if (typeof config !== 'object' || config === null) return {}
  const r = (config as Record<string, unknown>).reinforcement
  const parsed = ReinforcementConfig.safeParse(r)
  return parsed.success ? parsed.data : {}
}

export const ruleReinforcementHandler: HookHandler = async (ctx) => {
  // Env-var kill switch wins over config.
  if (ctx.env.ANVIL_DISABLE_REINFORCEMENT === '1') {
    return { exitCode: 0 }
  }

  const cfg = readConfig(ctx.config)
  if (cfg.disable === true) {
    return { exitCode: 0 }
  }

  const prompt = extractPrompt(ctx.payload) ?? ''
  // Empty prompts never trigger reinforcement; the primary handler will
  // surface the empty-prompt warning.
  if (prompt.trim().length === 0) {
    return { exitCode: 0 }
  }

  const everyNTurns = cfg.every_n_turns ?? DEFAULT_EVERY_N_TURNS
  const triggers = cfg.keyword_triggers ?? DEFAULT_KEYWORD_TRIGGERS
  const tokenBudget = cfg.token_budget ?? DEFAULT_REINFORCEMENT_TOKENS

  const projectRoot = (await findProjectRoot(ctx.cwd)) ?? ctx.cwd
  const counterPath = counterPathFor(projectRoot)

  // Increment turn counter unconditionally — even disabled-by-keyword turns
  // count toward the cadence so re-enabling does not bunch injections.
  const counter = readCounter(counterPath)
  counter.turns += 1

  const decision = decideInject({
    prompt,
    counter,
    everyNTurns,
    triggers,
  })

  if (!decision.inject) {
    writeCounter(counterPath, counter)
    return { exitCode: 0 }
  }

  // Build the digest, compact it, wrap it.
  const { skills, agents } = await readRegistry(projectRoot)
  const rawDigest = buildReinforcementDigest(skills, agents)
  const budgetChars = reinforcementCharBudget(tokenBudget)
  const compacted =
    budgetChars > 0
      ? compactStructuralSections(rawDigest, budgetChars, [
          ...DEFAULT_STARTUP_SECTION_PRIORITIES,
        ])
      : ''
  const finalBody =
    compacted.length > budgetChars && budgetChars > 0
      ? `${compacted.slice(0, Math.max(0, budgetChars - 1))}…`
      : compacted

  const envelope = wrapInEnvelope(finalBody)
  const systemInsert = createSystemDirective('SKILL_REINFORCEMENT', envelope)

  // Record the injection turn so cadence math advances.
  counter.last_injected_at_turn = counter.turns
  writeCounter(counterPath, counter)

  return {
    exitCode: 0,
    systemInsert,
    context: {
      reinforcement: {
        reason: decision.reason,
        turn: counter.turns,
      },
    },
  }
}

// ─── Test-only helpers ───────────────────────────────────────────────────────

/**
 * Test helper — overwrite the turn counter for a project root. Exported so
 * the cadence test suite can simulate "20 turns have elapsed" without
 * issuing 20 prompts.
 */
export function _setTurnCounterForTest(
  projectRoot: string,
  state: CounterFile,
): void {
  writeCounter(counterPathFor(projectRoot), state)
}
