import {
  HookRegistry,
  type HookSafetyAnnotations,
} from '../core/registry/hook-registry.js'
import type { HookKind, ModelsConfig } from '../core/types.js'
import type { HookHandlerProfileManifest } from '../core/types.js'
import {
  ccTaskCompletedHandler,
  ccTaskCreatedHandler,
} from './handlers/cc-task-events.js'
import { contextMonitorHandler } from './handlers/context-monitor.js'
import { gateguardHandler } from './handlers/gateguard.js'
import { gateguardStateHandler } from './handlers/gateguard/state.js'
import {
  memoryValidatorHandler,
  memoryValidatorProfileManifest,
} from './handlers/memory-validator.js'
import { notificationHandler } from './handlers/notification.js'
import { instructionsLoadedHandler } from './handlers/observability/instructions-loaded.js'
import { postCompactObservabilityHandler } from './handlers/observability/post-compact.js'
import { preCompactObservabilityHandler } from './handlers/observability/pre-compact.js'
import { onErrorHandler } from './handlers/on-error.js'
import { onLargeOutputHandler } from './handlers/on-large-output.js'
import { onPrOpenHandler } from './handlers/on-pr-open.js'
import { phaseBoundaryHandler } from './handlers/phase-boundary.js'
import { postEditAccumulatorHandler } from './handlers/post-edit-accumulator.js'
import { postEditHandler } from './handlers/post-edit.js'
import { postTestRunHandler } from './handlers/post-test-run.js'
import { postToolUseHandler } from './handlers/post-tool-use.js'
import { preCommitHandler } from './handlers/pre-commit.js'
import { preCompactSnapshotHandler } from './handlers/pre-compact.js'
import { preCompactSidecarHandler } from './handlers/pre-compact/handler.js'
import { prePushHandler } from './handlers/pre-push.js'
import { preToolUseHandler } from './handlers/pre-tool-use.js'
import {
  promptGuardHandler,
  promptGuardProfileManifest,
} from './handlers/prompt-guard.js'
import { readGuardHandler } from './handlers/read-guard.js'
import { ruleReinforcementHandler } from './handlers/rule-reinforcement.js'
import {
  rulesPromptInjectorSessionStart,
  rulesPromptInjectorUserPromptSubmit,
} from './handlers/rules-prompt-injector.js'
import { runtimeFallbackHandler } from './handlers/runtime-fallback.js'
import { sessionEndHandler } from './handlers/session-end.js'
import { sessionStartHandler } from './handlers/session-start.js'
import { stopHandler } from './handlers/stop.js'
import { subagentStopHandler } from './handlers/subagent-stop.js'
import { userPromptSubmitHandler } from './handlers/user-prompt-submit.js'
import { workflowGuardHandler } from './handlers/workflow-guard.js'

export interface LoadAllHooksOptions {
  config: ModelsConfig
  env?: Record<string, string | undefined>
}

const DEFAULTS: Array<{
  name: string
  kind: HookKind
  handler: Parameters<HookRegistry['register']>[2]
  /** Phase G — async: true marks non-blocking observational handlers */
  async?: boolean
  /** ANV-0051 — MCP-canonical 4-tuple safety annotation. */
  safety?: HookSafetyAnnotations
  /** ANV-0054 — respect_generated: true opts into the generated-file guard */
  respectGenerated?: boolean
  /** ANV-0128 — optional profile manifest declared by the handler. */
  profileManifest?: HookHandlerProfileManifest
}> = [
  {
    name: 'session-start',
    kind: 'session-start',
    handler: sessionStartHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    respectGenerated: true,
  },
  {
    name: 'user-prompt-submit',
    kind: 'user-prompt-submit',
    handler: userPromptSubmitHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'pre-commit',
    kind: 'pre-commit',
    handler: preCommitHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'post-edit',
    kind: 'post-edit',
    handler: postEditHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'pre-push',
    kind: 'pre-push',
    handler: prePushHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'on-error',
    kind: 'on-error',
    handler: onErrorHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'on-pr-open',
    kind: 'on-pr-open',
    handler: onPrOpenHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'post-tool-use',
    kind: 'post-tool-use',
    handler: postToolUseHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'post-test-run',
    kind: 'post-test-run',
    handler: postTestRunHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'context-monitor',
    kind: 'context-monitor',
    handler: contextMonitorHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'prompt-guard',
    kind: 'prompt-guard',
    handler: promptGuardHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    // ANV-0128 — three operating modes: minimal/balanced/strict.
    profileManifest: promptGuardProfileManifest,
  },
  {
    name: 'phase-boundary',
    kind: 'phase-boundary',
    handler: phaseBoundaryHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'read-guard',
    kind: 'read-guard',
    handler: readGuardHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'workflow-guard',
    kind: 'workflow-guard',
    handler: workflowGuardHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'session-end',
    kind: 'session-end',
    handler: sessionEndHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    respectGenerated: true,
  },
  {
    name: 'pre-compact',
    kind: 'pre-compact',
    handler: preCompactSnapshotHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    respectGenerated: true,
  },
  // ANV-0126 — runtime sidecar handler that captures active-routing.json
  // + active-skill.json to .anvil/runtime/pre-compact-<ISO>.json so the
  // next SessionStart can render a <session-restore> digest from it.
  // Disable via pre_compact.disable=true in models.json or the env var
  // ANVIL_DISABLE_PRE_COMPACT=1.
  {
    name: 'pre-compact-sidecar',
    kind: 'pre-compact',
    handler: preCompactSidecarHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'pre-tool-use',
    kind: 'pre-tool-use',
    handler: preToolUseHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'rules-prompt-injector:session-start',
    kind: 'session-start',
    handler: rulesPromptInjectorSessionStart,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'rules-prompt-injector:user-prompt-submit',
    kind: 'user-prompt-submit',
    handler: rulesPromptInjectorUserPromptSubmit,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'notification',
    kind: 'notification',
    handler: notificationHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'stop',
    kind: 'stop',
    handler: stopHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'subagent-stop',
    kind: 'subagent-stop',
    handler: subagentStopHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  // Plan 32 C2 — on-large-output. The dispatcher fires this internally after
  // post-tool-use; this registration makes it visible in doctor/hooks-list.
  // Disabled by default; real dispatch is inline in dispatcher.ts.
  {
    name: 'on-large-output',
    kind: 'on-large-output',
    handler: onLargeOutputHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  // Plan 39 Phase F — GateGuard.
  // gateguard: PreToolUse — blocks first edit per file until 4 facts observed.
  //   Default OFF; activated by workflow.gateguard=true config or ANVIL_GATEGUARD=1 env
  //   (set transiently by --strict on review/plan/debug/ultra/spec commands).
  //   The handler self-gates: returns exitCode 0 (no-op) when disabled.
  {
    name: 'gateguard',
    kind: 'pre-tool-use',
    handler: gateguardHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ANV-0125 — memory-validator: PreToolUse handler that denies edits to
  // CLAUDE.md / AGENTS.md when the proposed change would violate structural
  // invariants (drop the H1, break stub parity, or remove a table heading
  // row). Bypass via ANVIL_ALLOW_RESTRUCTURE=1 for intentional restructures.
  //
  // Wired through the pre-tool-use multiplexer (see handlers/pre-tool-use.ts);
  // this registry entry exists so doctor/hooks-list surfaces it as a first-
  // class hook.
  {
    name: 'memory-validator',
    kind: 'pre-tool-use',
    handler: memoryValidatorHandler,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    // ANV-0128 — three operating modes: minimal/balanced/strict.
    profileManifest: memoryValidatorProfileManifest,
  },
  // gateguard-state: PostToolUse — tracks Read/Grep/Glob events into session state.
  {
    name: 'gateguard-state',
    kind: 'post-tool-use',
    handler: gateguardStateHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  // gateguard-state: UserPromptSubmit — records that a user instruction exists.
  {
    name: 'gateguard-state:user-prompt-submit',
    kind: 'user-prompt-submit',
    handler: gateguardStateHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  // ANV-0124 — rule-reinforcement: UserPromptSubmit handler that reinjects
  // a compact <rule-reinforcement> envelope every N turns or on keyword
  // trigger. Disable via reinforcement.disable=true in models.json or the
  // env var ANVIL_DISABLE_REINFORCEMENT=1.
  {
    name: 'rule-reinforcement',
    kind: 'user-prompt-submit',
    handler: ruleReinforcementHandler,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  // Plan 44 Phase H — reactive runtime-fallback (Item 14).
  //   on-error: catches model_not_available / rate_limit_exceeded; advances
  //   the active fallback_chain up to RUNTIME_FALLBACK_MAX_RETRIES (shared
  //   with the proactive consumer in src/skills/runtime.ts). Default OFF;
  //   activated by workflow.runtime_fallback=true config or
  //   ANVIL_RUNTIME_FALLBACK=1 env. The handler self-gates: returns the
  //   'disabled' decision when neither flag is set. async (advisory).
  {
    name: 'runtime-fallback',
    kind: 'on-error',
    handler: runtimeFallbackHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  // ANV-0023 — observability hooks (PreCompact / PostCompact / InstructionsLoaded).
  //   InstructionsLoaded: mounted on session-start. Captures a rule-bearing
  //     baseline snapshot under .anvil/notepads/observability/ so PostCompact
  //     can detect degradation. Pure observational; always async.
  {
    name: 'observability:instructions-loaded',
    kind: 'session-start',
    handler: instructionsLoadedHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  //   PreCompact (observability): mounted on the existing pre-compact kind.
  //     Writes a rule-snapshot companion to the existing markdown dump.
  {
    name: 'observability:pre-compact',
    kind: 'pre-compact',
    handler: preCompactObservabilityHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  //   PostCompact (observability): mounted on session-start (the natural
  //     resume point after CC compacts). Compares against the most recent
  //     pre-compact snapshot and emits a degradation-detected directive
  //     when rule-bearing context vanished.
  {
    name: 'observability:post-compact',
    kind: 'session-start',
    handler: postCompactObservabilityHandler,
    async: true,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ANV-0175 Phase A — cc-task-events: observational Task() lifecycle
  // subscriber. PreToolUse path observes Task() dispatch; SubagentStop path
  // observes completion. Best-effort: no-ops when no plan run is active
  // (ANVIL_PLAN_RUN_DIR unset) and when ANVIL_CC_TASK_EVENTS=off. Async so
  // observation never blocks the host.
  {
    name: 'cc-task-events:created',
    kind: 'pre-tool-use',
    handler: ccTaskCreatedHandler,
    async: true,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'cc-task-events:completed',
    kind: 'subagent-stop',
    handler: ccTaskCompletedHandler,
    async: true,
    safety: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // Plan 39 Phase H — post-edit accumulator.
  // PostToolUse on Edit|Write|MultiEdit: accumulates edited file paths into
  // ~/.anvil/state/edit-accumulator-<sessionId>.json for batch format +
  // typecheck at Stop time. The handler self-gates on tool_name; non-edit
  // events are ignored. Always async (advisory, non-blocking).
  {
    name: 'post-edit-accumulator',
    kind: 'post-tool-use',
    handler: postEditAccumulatorHandler,
    async: true,
    safety: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
]

const SECURITY_HOOKS = new Set<HookKind>([
  'pre-commit',
  'pre-push',
  'prompt-guard',
  'read-guard',
  'workflow-guard',
])

type HookProfile = 'minimal' | 'standard' | 'strict'

function resolveProfile(
  env: Record<string, string | undefined>,
): HookProfile | null {
  const val = env.ANVIL_HOOK_PROFILE
  if (val === 'minimal' || val === 'standard' || val === 'strict') return val
  return null
}

/**
 * Parses the `ANVIL_DISABLED_HOOKS` env var (T4.2). Comma-separated list of
 * HookKind strings. Invalid tokens are warned and dropped so a typo never
 * silently disables unintended hooks.
 */
function parseDisabledHooksEnv(raw: string | undefined): {
  valid: HookKind[]
  invalid: string[]
} {
  if (!raw || raw.trim().length === 0) return { valid: [], invalid: [] }
  const valid: HookKind[] = []
  const invalid: string[] = []
  const allKinds = new Set<string>(
    DEFAULTS.map((d) => d.kind as string).concat([
      'session-start',
      'session-end',
      'user-prompt-submit',
      'pre-tool-use',
      'post-tool-use',
      'pre-compact',
      'notification',
      'stop',
      'subagent-stop',
    ]),
  )
  for (const token of raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)) {
    if (allKinds.has(token)) {
      valid.push(token as HookKind)
    } else {
      invalid.push(token)
    }
  }
  if (invalid.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `ANVIL_DISABLED_HOOKS: dropping unknown kind(s): ${invalid.join(', ')}`,
    )
  }
  return { valid, invalid }
}

function resolveDisabledSet(
  profile: HookProfile | null,
  configDisabled: HookKind[],
  envDisabled: HookKind[],
): Set<HookKind> {
  const envSet = new Set<HookKind>(envDisabled)
  if (profile === 'strict') {
    return envSet
  }
  if (profile === 'minimal') {
    const allKinds = DEFAULTS.map((d) => d.kind)
    const set = new Set<HookKind>(
      allKinds.filter((k) => !SECURITY_HOOKS.has(k)),
    )
    for (const k of envSet) set.add(k)
    return set
  }
  const set = new Set<HookKind>(configDisabled)
  for (const k of envSet) set.add(k)
  return set
}

export function loadAllHooks(opts: LoadAllHooksOptions): HookRegistry {
  const registry = new HookRegistry()
  const env = opts.env ?? {}
  const profile = resolveProfile(env)
  const envDisabled = parseDisabledHooksEnv(env.ANVIL_DISABLED_HOOKS).valid
  const disabled = resolveDisabledSet(
    profile,
    opts.config.disabled.hooks as HookKind[],
    envDisabled,
  )

  for (const entry of DEFAULTS) {
    // Security-bearing handlers (pre-tool-use multiplexer, pre-commit,
    // pre-push) get priority 10 so they fire ahead of advisory siblings
    // within the same stage (T4.3).
    const priority =
      entry.name === 'pre-tool-use' ||
      entry.name === 'pre-commit' ||
      entry.name === 'pre-push'
        ? 10
        : 0
    registry.register(entry.name, entry.kind, entry.handler, {
      priority,
      ...(entry.async ? { async: true } : {}),
      ...(entry.safety ? { safety: entry.safety } : {}),
      ...(entry.respectGenerated ? { respectGenerated: true } : {}),
      // ANV-0128 — pass through the optional profile manifest so the
      // dispatcher can resolve the active profile per call.
      ...(entry.profileManifest
        ? { profileManifest: entry.profileManifest }
        : {}),
    })
    if (disabled.has(entry.kind)) {
      registry.disable(entry.name)
    }
  }
  return registry
}

/** Shape returned by getHookSafetyRecords for doctor coverage checks. */
export interface HookSafetyRecord {
  name: string
  safety?: HookSafetyAnnotations
}

/**
 * Returns the safety annotation metadata for all default hook handlers.
 * Consumed by the doctor row via dynamic import — avoids duplicating DEFAULTS.
 */
export function getHookSafetyRecords(): HookSafetyRecord[] {
  return DEFAULTS.map((d) => ({ name: d.name, safety: d.safety }))
}

/** ANV-0128 — shape returned by `getHookProfileRecords()`. */
export interface HookProfileRecord {
  name: string
  profileManifest: HookHandlerProfileManifest
}

/**
 * ANV-0128 — Returns metadata for every handler that declares a profile
 * manifest. Consumed by the doctor row to surface the active profile per
 * handler. Handlers without a manifest are omitted.
 */
export function getHookProfileRecords(): HookProfileRecord[] {
  const out: HookProfileRecord[] = []
  for (const d of DEFAULTS) {
    if (d.profileManifest) {
      out.push({ name: d.name, profileManifest: d.profileManifest })
    }
  }
  return out
}
