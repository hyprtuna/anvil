import type {
  HookHandler,
  HookHandlerProfileManifest,
  HookKind,
} from '../types.js'

/**
 * ANV-0051 — MCP-canonical 4-tuple safety annotation for a hook handler.
 *
 * Mirrors CommandSafetyAnnotations / AgentSafetyAnnotations but scoped to
 * the hook surface. All four fields are optional at the type level so
 * existing registrations compile; the doctor row warns when coverage < 100%.
 */
export interface HookSafetyAnnotations {
  /** True when the hook produces no persistent side-effects. */
  readOnlyHint?: boolean
  /**
   * True when the hook may irreversibly destroy or overwrite data.
   * Only meaningful when readOnlyHint=false.
   */
  destructiveHint?: boolean
  /** True when running the hook N times has the same effect as running once. */
  idempotentHint?: boolean
  /** True when the hook may contact external systems (network, APIs, etc.). */
  openWorldHint?: boolean
}

export interface RegisteredHook {
  kind: HookKind
  handler: HookHandler
  name: string
  enabled: boolean
  /** Dispatch priority within a kind. Higher priorities run first. Default 0. */
  priority: number
  /** Insertion index, used as a deterministic tiebreaker inside a priority tier. */
  insertionOrder: number
  /**
   * Plan 28 Phase D2/D4. Optional CC-style matcher (literal tool name or
   * regex), evaluated against `payload.tool_name` before invoking.
   */
  matcher?: string | undefined
  /**
   * Plan 28 Phase D2/D4. Optional permission-rule predicates (`Bash(git *)`,
   * `Read(/src/**)`, etc.). Evaluated via `evaluateIf` before invoking.
   */
  ifRules?: string | string[] | undefined
  /**
   * Phase G — async flag. When true, the dispatcher fires this handler via
   * setImmediate (non-blocking) and returns immediately. The handler result
   * does NOT participate in exitCode aggregation or message collection.
   * Failures are logged to ~/.anvil/logs/hook-async-failures.json.
   * Default: false (sync/blocking behavior).
   */
  async?: boolean | undefined
  /**
   * ANV-0051 — MCP-canonical 4-tuple safety annotation for this handler.
   * Optional; the doctor row warns when coverage < 100%.
   */
  safety?: HookSafetyAnnotations | undefined
  /**
   * ANV-0054 — generated-file guard opt-in.
   * When true, disk-mutating handlers consult `isGenerated()` before writing
   * and skip the write (logging a warning) when the target is flagged.
   * Default: false (backward-compatible).
   */
  respectGenerated?: boolean | undefined
  /**
   * ANV-0128 — optional profile manifest declared by the handler.
   * When present, the dispatcher resolves the active profile name (from
   * `config.hooks.<handler-name>.profile`, falling back to
   * `manifest.defaultProfile`) and threads it through `ctx.profile`.
   * Handlers without a manifest continue to receive `ctx.profile === undefined`.
   */
  profileManifest?: HookHandlerProfileManifest | undefined
}

export interface RegisterOptions {
  priority?: number
  matcher?: string
  ifRules?: string | string[]
  /** Phase G — when true, handler runs in background via setImmediate. */
  async?: boolean
  /** ANV-0051 — MCP 4-tuple safety annotation for this handler. */
  safety?: HookSafetyAnnotations
  /** ANV-0054 — when true, handler consults isGenerated() before disk writes. */
  respectGenerated?: boolean
  /** ANV-0128 — optional profile manifest declared by the handler. */
  profileManifest?: HookHandlerProfileManifest
}

export class HookRegistry {
  private readonly hooks: RegisteredHook[] = []

  register(
    name: string,
    kind: HookKind,
    handler: HookHandler,
    opts: RegisterOptions = {},
  ): void {
    this.hooks.push({
      kind,
      handler,
      name,
      enabled: true,
      priority: opts.priority ?? 0,
      insertionOrder: this.hooks.length,
      matcher: opts.matcher,
      ifRules: opts.ifRules,
      async: opts.async,
      safety: opts.safety,
      respectGenerated: opts.respectGenerated,
      profileManifest: opts.profileManifest,
    })
  }

  /**
   * Returns handlers for a kind in dispatch order:
   * descending `priority`, ascending `insertionOrder` on ties.
   * Stable across runs (T4.3).
   */
  getHandlers(kind: HookKind): HookHandler[] {
    return this.hooks
      .filter((h) => h.kind === kind && h.enabled)
      .slice()
      .sort((a, b) =>
        a.priority !== b.priority
          ? b.priority - a.priority
          : a.insertionOrder - b.insertionOrder,
      )
      .map((h) => h.handler)
  }

  disable(name: string): void {
    const hook = this.hooks.find((h) => h.name === name)
    if (hook) hook.enabled = false
  }

  enable(name: string): void {
    const hook = this.hooks.find((h) => h.name === name)
    if (hook) hook.enabled = true
  }

  /** Update the priority of a previously-registered hook. */
  setPriority(name: string, priority: number): void {
    const hook = this.hooks.find((h) => h.name === name)
    if (hook) hook.priority = priority
  }

  getAll(): RegisteredHook[] {
    return [...this.hooks]
  }
}
