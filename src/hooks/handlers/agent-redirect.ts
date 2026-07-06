/**
 * Agent-redirect PreToolUse handler (Plan 45 / v0.11.0 Phase C2).
 *
 * When `workflow.agent_redirect = true`, denies Task/Agent dispatch with
 * `subagent_type: "anvil:<slug>"` if `<slug>` resolves to a registered skill
 * rather than a registered agent. Unknown slugs pass through (typo tolerance
 * per D-10).
 *
 * Output channels:
 *   message      — human-visible hint in the terminal.
 *   systemInsert — model-visible redirect directive so the LLM re-routes.
 *
 * Telemetry: JSONL line written to ~/.anvil/logs/hook-events.jsonl on deny
 * (tagged agent_redirect_fired). Best-effort; failures are swallowed silently.
 *
 * Registered as a sub-handler inside the pre-tool-use multiplexer
 * (pre-tool-use.ts), inserted before workflow-guard. Self-gating:
 * returns exitCode 0 immediately when the flag is off.
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getUserHome } from '../../core/io/home.js'
import { safeAppend } from '../../core/io/safe-write.js'
import { AgentRegistry } from '../../core/registry/agent-registry.js'
import { SkillRegistry } from '../../core/registry/skill-registry.js'
import type { HookHandler, HookResult } from '../../core/types.js'
import { createSystemDirective } from '../system-directive.js'
import { loadWorkflowConfig } from './workflow-guard/config.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegistryAccessors {
  hasSkill: (name: string) => boolean
  hasAgent: (name: string) => boolean
}

// ─── Payload extraction ───────────────────────────────────────────────────────

function readToolCall(payload: unknown): {
  tool: string
  subagentType: string | null
} | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.tool_name !== 'string') return null
  const input =
    typeof p.tool_input === 'object' && p.tool_input !== null
      ? (p.tool_input as Record<string, unknown>)
      : {}
  const subagentType =
    typeof input.subagent_type === 'string' ? input.subagent_type : null
  return { tool: p.tool_name, subagentType }
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

const LOG_DIR = join(getUserHome(), '.anvil', 'logs')
const LOG_FILE = join(LOG_DIR, 'hook-events.jsonl')

async function appendTelemetry(slug: string): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true })
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'agent_redirect_fired',
      slug,
    })}\n`
    safeAppend(LOG_FILE, line, { maxBytes: 8 * 1024 })
  } catch {
    // Best-effort — telemetry failures must never break the primary path.
  }
}

// ─── Hint message builder ─────────────────────────────────────────────────────

const ANVIL_PREFIX = 'anvil:'

function buildHint(slug: string): { message: string; systemInsert: string } {
  const qualifiedSlug = `${ANVIL_PREFIX}${slug}`
  const hint =
    `\`${qualifiedSlug}\` is a registered skill, not an agent. ` +
    `Invoke it with \`Skill({skill: "${qualifiedSlug}"})\` instead of ` +
    `\`Agent({subagent_type: "${qualifiedSlug}"})\`.`
  return {
    message: hint,
    systemInsert: createSystemDirective('ROUTING_HINT', hint),
  }
}

// ─── Handler factory (allows injecting test-double registries) ────────────────

export function createAgentRedirectHandler(
  registries: RegistryAccessors,
): HookHandler {
  return async (ctx): Promise<HookResult> => {
    const ALLOW: HookResult = { exitCode: 0 }

    // 1. Read the workflow config; short-circuit when flag is off.
    const { config: workflowConfig } = await loadWorkflowConfig(ctx.cwd)
    if (!workflowConfig.agent_redirect) return ALLOW

    // 2. Extract tool call; only act on Task invocations.
    const call = readToolCall(ctx.payload)
    if (call === null || call.tool !== 'Task') return ALLOW

    // 3. Only process anvil: prefixed subagent_types.
    if (
      call.subagentType === null ||
      !call.subagentType.startsWith(ANVIL_PREFIX)
    ) {
      return ALLOW
    }

    const slug = call.subagentType.slice(ANVIL_PREFIX.length)

    // 4. Slug is a known agent → allow.
    if (registries.hasAgent(slug)) return ALLOW

    // 5. Slug is a known skill → deny with redirect hint.
    if (registries.hasSkill(slug)) {
      const { message, systemInsert } = buildHint(slug)
      // Fire telemetry best-effort (D-11).
      void appendTelemetry(slug)
      return { exitCode: 2, message, systemInsert }
    }

    // 6. Unknown slug → allow (typo tolerance per D-10).
    return ALLOW
  }
}

// ─── Default export using real registries (loaded lazily) ────────────────────
// Real registries are typically populated by the skill/agent loaders at session
// start. For the hook handler, we load them lazily on first invocation so that
// the handler file can be compiled without circular import concerns.

let _skillRegistry: SkillRegistry | null = null
let _agentRegistry: AgentRegistry | null = null

function getRealRegistries(): RegistryAccessors {
  if (!_skillRegistry) _skillRegistry = new SkillRegistry()
  if (!_agentRegistry) _agentRegistry = new AgentRegistry()
  return {
    hasSkill: (n) => _skillRegistry!.has(n),
    hasAgent: (n) => _agentRegistry!.has(n),
  }
}

/**
 * Production handler — uses real SkillRegistry / AgentRegistry instances.
 * At session start time these registries have been populated by the loaders
 * (src/skills/ and src/agents/ respectively). The hook fires after population
 * so `.has()` calls reflect the actual loaded surfaces.
 */
export const agentRedirectHandler: HookHandler = (ctx) =>
  createAgentRedirectHandler(getRealRegistries())(ctx)
