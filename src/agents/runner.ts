import { resolveModel } from '../core/models/resolve.js'
import { isRetryableSDKError } from '../core/models/retry.js'
import type { AgentRegistry } from '../core/registry/agent-registry.js'
import { parseSchemaField } from '../core/types.js'
import type {
  Agent,
  HandoffStatus,
  ModelResolution,
  ModelsConfig,
  RoutingDecision,
} from '../core/types.js'
import { buildRequiredReadingBlock } from './required-reading.js'

/**
 * Canonical invocation-terminal statuses (T3.4). A subset of HandoffStatus —
 * only the four that a running invocation can terminate with. Pending /
 * in_progress are lifecycle-internal and never appear here.
 */
export type InvocationStatus = Extract<
  HandoffStatus,
  'done' | 'done_with_concerns' | 'needs_context' | 'blocked'
>

export const INVOCATION_STATUSES: InvocationStatus[] = [
  'done',
  'done_with_concerns',
  'needs_context',
  'blocked',
]

export interface AgentInvocation {
  agent: Agent
  resolvedModel: ModelResolution
  prompt: string
  tools: string[]
  maxTurns: number
  /** The routing decision the invocation was built from, when present. */
  routingDecision?: RoutingDecision
  /**
   * Cascade of fallback model IDs to try on transient SDK failures
   * (model_not_available / rate_limit_exceeded). Aliases are already resolved
   * to concrete model IDs. Empty array = no fallback behaviour.
   *
   * Plan 33 D: `runInvocation` walks this chain on retryable SDK errors.
   * Cap: 2 retries = 3 total attempts (primary + 2 fallbacks).
   * After cap, the original error surfaces (not the last attempt's error).
   */
  fallback_chain: string[]
}

/**
 * Sub-task dispatch tier convention (Plan 38 Phase D)
 *
 * When fanning out subagent calls, pass `dispatchTierContext` to
 * `prepareInvocation` to run each subtask at the appropriate model tier:
 *
 * | Use case                          | Recommended tier |
 * |-----------------------------------|-----------------|
 * | Read-only exploration / search    | `quick`         |
 * | Implementation / coding           | `coding`        |
 * | Verification / review             | `review`        |
 * | Architecture / planning decisions | `planning`      |
 * | Max-effort autonomous work        | `ultra`         |
 * | Human-stakes escalation           | `super`         |
 *
 * Conflict rule: an explicit `--model` flag always wins over `--tier`
 * (resolver layer-1 precedence). Tier context is per-call — it is never
 * stashed as session state and does not affect the caller's own tier.
 */
export interface PrepareInvocationOptions {
  /**
   * When supplied, the router's pre-ranked skill bundle is rendered into
   * the agent prompt as a "Skills loaded" preamble, and the full decision
   * is attached to the invocation for downstream observability.
   */
  routingDecision?: RoutingDecision
  /**
   * Plan 38 Phase D — subagent dispatch tier context.
   *
   * When provided, the runner forwards `tier` as `cli.tier` into the resolver
   * call site, allowing an orchestrator to dispatch a subagent at a different
   * tier than its own (e.g. orchestrator at `planning` dispatches a
   * `code-explorer` subagent at `quick` for cheap read-only exploration).
   *
   * Per-call only — never stashed as session state. The dispatched subagent's
   * own frontmatter tier applies if `dispatchTierContext` is absent.
   */
  dispatchTierContext?: { tier?: string }
  /**
   * Plan 40 Phase G — headless mode shell. When `true`, the runner prepends
   * a HEADLESS-MODE banner block to the dispatch prompt and pre-flight
   * enforces ultra-worker pass-cap (5) and per-pass tool budget (20).
   * Banned-tool list is deferred to v0.10.4 (D-04 finalization).
   */
  auto?: boolean
  /**
   * Plan 43 Phase I — repo-relative root used to resolve `required_reading`
   * paths declared in agent frontmatter. Defaults to `process.cwd()` when
   * absent. The resolved file contents are prepended to the dispatch prompt
   * as a `<required_reading>` block, capped at 8 KB total (REQUIRED_READING_BYTE_CAP).
   */
  cwd?: string
}

/**
 * Renders a compact, agent-friendly preamble describing the skill + rule
 * bundle the router selected. Emitted as a fenced block so it does not
 * collide with agent-body content.
 */
/**
 * Plan 40 Phase G / ANV-0076 — headless-mode banner prepended to ultra-worker
 * dispatch prompts when `auto: true` is passed. Enforced caps:
 *   - pass-cap = 5 (max autonomous loops before BLOCKED)
 *   - per-pass tool budget = 20 (max tool calls in a single pass)
 *
 * ANV-0076 (D-04 finalized): banned-tool denylist enforced at dispatch time
 * via `assertHeadlessToolAllowed`. Interactive/human-in-loop tools must never
 * fire in CI/headless contexts.
 */

/** Tools that must never run in headless/CI mode (ANV-0076). */
export const HEADLESS_TOOL_DENYLIST: readonly string[] = [
  'AskUserQuestion',
  'Skill',
  'SlashCommand',
]

/**
 * Throws if `tool` is on the headless denylist. Call this before dispatching
 * any tool in a headless invocation. Logs to stderr for telemetry.
 */
export function assertHeadlessToolAllowed(tool: string): void {
  if (HEADLESS_TOOL_DENYLIST.includes(tool)) {
    const msg = `[headless] tool '${tool}' is denied in CI/headless mode (ANV-0076)`
    process.stderr.write(`${msg}\n`)
    throw new Error(msg)
  }
}

export const HEADLESS_MODE_BANNER = `<HEADLESS-MODE>
You are running in --auto headless mode. Hard caps enforced by the runner:
  - pass-cap: 5 (max autonomous plan-execute-verify loops)
  - per-pass tool budget: 20 (max tool calls per loop iteration)
On exhaustion, emit \`status: BLOCKED\` and stop.
Banned tools (never call in headless mode): ${HEADLESS_TOOL_DENYLIST.join(', ')}.
</HEADLESS-MODE>`

export const HEADLESS_PASS_CAP = 5
export const HEADLESS_PER_PASS_TOOL_BUDGET = 20

function renderRoutingPreamble(decision: RoutingDecision): string {
  const lines: string[] = ['[routing]']
  lines.push(
    `intent=${decision.intent} confidence=${decision.confidence.toFixed(2)} mode=${decision.mode}`,
  )
  if (decision.skills.length > 0) {
    lines.push(`skills=${decision.skills.join(', ')}`)
  }
  if (decision.rules.prompt.length > 0) {
    lines.push(`rules.prompt=${decision.rules.prompt.join(', ')}`)
  }
  if (decision.rules.execution.length > 0) {
    lines.push(`rules.execution=${decision.rules.execution.join(', ')}`)
  }
  if (decision.rules.safety.length > 0) {
    lines.push(`rules.safety=${decision.rules.safety.join(', ')}`)
  }
  if (decision.rules.workflow.length > 0) {
    lines.push(`rules.workflow=${decision.rules.workflow.join(', ')}`)
  }
  if (decision.secondaryIntents.length > 0) {
    const sec = decision.secondaryIntents
      .map((s) => `${s.agent}[${s.intent}]`)
      .join(', ')
    lines.push(`secondary=${sec}`)
  }
  if (decision.fallback) {
    lines.push(`fallback=${decision.fallback}`)
  }
  return lines.join('\n')
}

export function prepareInvocation(
  registry: AgentRegistry,
  config: ModelsConfig,
  name: string,
  prompt: string,
  options: PrepareInvocationOptions = {},
): AgentInvocation {
  const agent = registry.get(name)
  if (!agent) throw new Error(`agent not found: ${name}`)
  // Plan 38 Phase D: when a dispatchTierContext is provided, forward its tier
  // as cli.tier into the resolver so the subagent runs at the caller-specified tier.
  const cliOpts =
    options.dispatchTierContext?.tier !== undefined
      ? { tier: options.dispatchTierContext.tier }
      : undefined
  const resolved = resolveModel(name, config, {
    env: process.env,
    ...(cliOpts ? { cli: cliOpts } : {}),
  })

  const parts: string[] = []
  if (options.auto) {
    parts.push(HEADLESS_MODE_BANNER)
  }
  // Plan 43 Phase I — required_reading injection (Item 23).
  // E-005: pass agent name so missing paths are surfaced to stderr (D-09).
  const requiredReading = buildRequiredReadingBlock(
    agent.frontmatter.required_reading,
    options.cwd ?? process.cwd(),
    agent.frontmatter.name,
  )
  if (requiredReading) {
    parts.push(requiredReading)
  }
  parts.push(agent.body)
  if (options.routingDecision) {
    parts.push(renderRoutingPreamble(options.routingDecision))
  }
  parts.push(prompt)

  return {
    agent,
    resolvedModel: resolved,
    prompt: parts.join('\n\n---\n\n'),
    tools: agent.frontmatter.tools,
    maxTurns: agent.frontmatter.max_turns,
    fallback_chain: resolved.fallback_chain,
    ...(options.routingDecision
      ? { routingDecision: options.routingDecision }
      : {}),
  }
}

// ─── runInvocation + status protocol (T3.4) ─────────────────────────────

/**
 * Structured concern emitted when output_schema validation fails (Plan 33 B2).
 * Appended to `InvocationResult.concerns`; status becomes `done_with_concerns`.
 */
export interface SchemaConcern {
  type: 'schema'
  errors: string[]
}

/**
 * Structured error emitted when input_schema validation fails (Plan 33 B2).
 * Returned as a synthetic `InvocationResult` with status `done_with_concerns`
 * before the executor is ever invoked.
 */
export interface SchemaFailResult {
  status: 'done_with_concerns'
  output: string
  artifacts: []
  concerns: [SchemaConcern]
}

export interface InvocationResult {
  status: InvocationStatus
  /** Full raw output as produced by the underlying SDK caller. */
  output: string
  /** Structured artifacts the agent emitted (paths, JSON fragments, text). */
  artifacts: Array<{
    name: string
    kind: 'file' | 'json' | 'text'
    value: string
  }>
  /** The final `{"status":"..."}` JSON line parsed out of the output, if any. */
  statusLine?: string
  /**
   * Schema-validation concerns (Plan 33 B2). Set when `output_schema` is
   * declared but the agent's output failed validation. The raw output is
   * still returned unchanged; the caller decides how to handle the mismatch.
   */
  concerns?: SchemaConcern[]
}

/**
 * Caller-supplied executor: takes a prepared invocation, returns whatever
 * stream of output the underlying Claude SDK emits. Kept injectable so
 * tests and future alternate runtimes (OpenCode, Claude Code SDK) can
 * plug in without touching the status protocol.
 */
export type InvocationExecutor = (
  invocation: AgentInvocation,
) => Promise<string>

const STATUS_LINE_REGEX =
  /\{\s*"status"\s*:\s*"(done|done_with_concerns|needs_context|blocked)"[^}]*\}/

/**
 * Pulls the final `{"status":"..."}` line out of free-form agent output.
 *
 * Convention (documented in the runner preamble when executed): the agent
 * emits a single JSON line as its last non-empty line, naming one of the
 * four canonical statuses. If absent / unparseable, default to
 * 'done_with_concerns' so nothing silently becomes 'done'.
 */
export function parseInvocationStatus(output: string): {
  status: InvocationStatus
  statusLine?: string
} {
  const lines = output.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(STATUS_LINE_REGEX)
    if (match) {
      return {
        status: match[1] as InvocationStatus,
        statusLine: lines[i].trim(),
      }
    }
  }
  return { status: 'done_with_concerns' }
}

/**
 * Runs an invocation end-to-end: dispatches via the provided executor,
 * parses the terminal status line, returns a structured result.
 *
 * Plan 33 B2 boundary validation:
 *  - Input boundary: if the agent declares `input_schema`, validate the prompt
 *    before invoking the executor. On failure, return `done_with_concerns` with
 *    a `SchemaConcern` and skip the executor entirely.
 *  - Output boundary: if the agent declares `output_schema`, validate the
 *    output after the executor returns. On failure, mark the result
 *    `done_with_concerns` with a `SchemaConcern`, but return the raw output
 *    unchanged — the caller decides.
 *
 * Artifact extraction is intentionally narrow — just the final status line.
 * Agents needing structured output declare `output_schema:` (Plan 33 B2),
 * which is validated post-executor and surfaced via SchemaConcern on failure.
 */
export async function runInvocation(
  invocation: AgentInvocation,
  executor: InvocationExecutor,
): Promise<InvocationResult> {
  // ── Input boundary validation (Plan 33 B2) ──────────────────────────────
  const inputSchemaRaw = invocation.agent.frontmatter.input_schema
  if (inputSchemaRaw !== undefined && inputSchemaRaw !== null) {
    const inputSchema = parseSchemaField(inputSchemaRaw)
    if (inputSchema) {
      const parsed = inputSchema.safeParse(invocation.prompt)
      if (!parsed.success) {
        const errors = parsed.error.errors.map(
          (e) => `${e.path.join('.') || '(root)'}: ${e.message}`,
        )
        return {
          status: 'done_with_concerns',
          output: `SCHEMA_FAIL: input validation failed for agent "${invocation.agent.frontmatter.name}":\n${errors.join('\n')}`,
          artifacts: [],
          concerns: [{ type: 'schema', errors }],
        }
      }
    }
  }

  // ── Execute with fallback_chain retry loop (Plan 33 D1–D2) ─────────────
  //
  // Cap: MAX_RETRIES=2 → at most 3 total attempts (primary + 2 fallbacks).
  // The ORIGINAL error surfaces after cap, not the last retry's error — this
  // preserves the root cause for operators.
  // Phase B's input_schema check runs before this block; output_schema runs
  // after — the retry loop is intentionally tight around the executor call.
  const MAX_RETRIES = 2
  const chain = invocation.fallback_chain
  let originalError: unknown
  let output: string | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // On retry attempts, substitute the next chain entry as the model.
    const currentInvocation: AgentInvocation =
      attempt === 0
        ? invocation
        : {
            ...invocation,
            resolvedModel: {
              ...invocation.resolvedModel,
              model: chain[attempt - 1],
              source: 'default', // fallback — source is informational
            },
          }

    try {
      output = await executor(currentInvocation)
      break // success — exit the loop
    } catch (err) {
      if (attempt === 0) {
        // Capture original error on first failure.
        originalError = err
      }

      const isRetryable = isRetryableSDKError(err)
      const hasChainEntry = attempt < chain.length
      const canRetry = isRetryable && hasChainEntry && attempt < MAX_RETRIES

      if (!canRetry) {
        // Surface original error (not err, which may be from a later retry).
        throw originalError
      }
      // else: continue to next attempt
    }
  }

  // output is always set here — loop only exits via break (success) or throw
  // TypeScript cannot infer the loop invariant, so we default to empty string
  // (unreachable: the loop always either assigns output or throws)
  const executorOutput = output ?? ''
  const { status, statusLine } = parseInvocationStatus(executorOutput)

  // ── Output boundary validation (Plan 33 B2) ─────────────────────────────
  const outputSchemaRaw = invocation.agent.frontmatter.output_schema
  if (outputSchemaRaw !== undefined && outputSchemaRaw !== null) {
    const outputSchema = parseSchemaField(outputSchemaRaw)
    if (outputSchema) {
      // Extract the best JSON object from the output. Agents embed structured
      // JSON in prose, so we scan for ALL top-level {…} blocks by tracking
      // brace depth, collect candidates, then try the LARGEST valid one
      // (status line is short; the structured output is longest).
      let outputValue: unknown = executorOutput
      {
        const candidates: string[] = []
        let depth = 0
        let start = -1
        for (let i = 0; i < executorOutput.length; i++) {
          if (executorOutput[i] === '{') {
            if (depth === 0) start = i
            depth++
          } else if (executorOutput[i] === '}') {
            depth--
            if (depth === 0 && start !== -1) {
              candidates.push(executorOutput.slice(start, i + 1))
              start = -1
            }
          }
        }
        // Sort by length descending — longest JSON object is the structured output.
        candidates.sort((a, b) => b.length - a.length)
        for (const candidate of candidates) {
          try {
            outputValue = JSON.parse(candidate)
            break
          } catch {
            // not valid JSON, try next
          }
        }
      }

      const parsed = outputSchema.safeParse(outputValue)
      if (!parsed.success) {
        const errors = parsed.error.errors.map(
          (e) => `${e.path.join('.') || '(root)'}: ${e.message}`,
        )
        return {
          status: 'done_with_concerns',
          output: executorOutput,
          artifacts: [],
          ...(statusLine ? { statusLine } : {}),
          concerns: [{ type: 'schema', errors }],
        }
      }
    }
  }

  return {
    status,
    output: executorOutput,
    artifacts: [],
    ...(statusLine ? { statusLine } : {}),
  }
}
