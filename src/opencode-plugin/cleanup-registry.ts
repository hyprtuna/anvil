/**
 * Cleanup registry for the OpenCode plugin runtime (ANV-0097).
 *
 * Long-lived plugin state (caches, watchers, timers, MCP clients) registers
 * teardown functions here. On plugin shutdown / reload the registry invokes
 * them in **LIFO** order with a per-handler timeout so a hung handler can
 * never block the drain.
 *
 * Contract:
 *   - `register(fn)` returns an unregister handle (single-shot; safe to
 *     call after `drain()` — no-op).
 *   - `drain()` invokes every registered teardown in reverse insertion
 *     order, each wrapped in `try/catch` so a throwing handler does NOT
 *     prevent later teardowns from running.
 *   - Each teardown is bounded by `timeoutMs` (default 5_000); when the
 *     timeout fires the handler is abandoned (the registry resolves and
 *     proceeds to the next teardown).
 *   - Errors and timeouts are collected and surfaced on the resolved
 *     `DrainReport`; they are never re-thrown to the caller.
 *
 * Compatibility:
 *   - Matches the `Symbol.asyncDispose` shape introduced in the TC39
 *     Explicit Resource Management proposal (Node 22+). The registry is
 *     itself `AsyncDisposable`: `await using r = createCleanupRegistry()`.
 *   - The fallback property `dispose` is provided for older runtimes that
 *     do not have `Symbol.asyncDispose` polyfilled.
 *
 * Leaf-layer note: this module belongs to `src/opencode-plugin/` (layer 5)
 * and intentionally has no imports from other layers — the OC plugin
 * bundle stays self-contained.
 */

/** Default per-handler timeout in milliseconds. */
export const DEFAULT_TEARDOWN_TIMEOUT_MS = 5_000

/** A teardown function. May be sync or async; return value is ignored. */
export type Teardown = () => void | Promise<void>

/** Handle returned by `register`; calling it removes the teardown. */
export type UnregisterHandle = () => void

/** Outcome record for a single teardown invocation during `drain()`. */
export interface TeardownOutcome {
  readonly index: number
  readonly outcome: 'ok' | 'error' | 'timeout'
  readonly error?: unknown
}

/** Aggregate report returned by `drain()`. */
export interface DrainReport {
  readonly total: number
  readonly ok: number
  readonly errors: number
  readonly timeouts: number
  readonly outcomes: ReadonlyArray<TeardownOutcome>
}

/** Public registry interface. */
export interface CleanupRegistry {
  /** Register a teardown. Returns an idempotent unregister handle. */
  register(fn: Teardown): UnregisterHandle
  /** Number of currently-registered teardowns. */
  readonly size: number
  /**
   * Invoke every teardown in LIFO order. Each is bounded by `timeoutMs`
   * (overrides the registry default for this drain). Never rejects.
   */
  drain(timeoutMs?: number): Promise<DrainReport>
  /** `await using` support (Node 22+). Delegates to `drain()`. */
  [Symbol.asyncDispose](): Promise<void>
  /** Fallback for runtimes without `Symbol.asyncDispose`. */
  dispose(): Promise<void>
}

interface Entry {
  readonly id: number
  readonly fn: Teardown
}

/**
 * Race a teardown invocation against a wall-clock timeout.
 * Resolves with the outcome; never rejects.
 */
async function runWithTimeout(
  fn: Teardown,
  timeoutMs: number,
  index: number,
): Promise<TeardownOutcome> {
  return new Promise<TeardownOutcome>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ index, outcome: 'timeout' })
    }, timeoutMs)
    // Ensure the timer doesn't keep the event loop alive on its own.
    if (typeof timer.unref === 'function') timer.unref()

    Promise.resolve()
      .then(() => fn())
      .then(
        () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ index, outcome: 'ok' })
        },
        (err: unknown) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ index, outcome: 'error', error: err })
        },
      )
  })
}

/**
 * Construct a fresh cleanup registry. Independent instances are isolated;
 * the plugin uses a single module-level singleton (`pluginCleanup`) below.
 */
export function createCleanupRegistry(
  defaultTimeoutMs: number = DEFAULT_TEARDOWN_TIMEOUT_MS,
): CleanupRegistry {
  if (
    !Number.isFinite(defaultTimeoutMs) ||
    defaultTimeoutMs <= 0 ||
    !Number.isInteger(defaultTimeoutMs)
  ) {
    throw new TypeError(
      `createCleanupRegistry: defaultTimeoutMs must be a positive integer, got ${String(defaultTimeoutMs)}`,
    )
  }

  const entries: Entry[] = []
  let nextId = 1
  let draining = false

  const registry: CleanupRegistry = {
    register(fn: Teardown): UnregisterHandle {
      if (typeof fn !== 'function') {
        throw new TypeError('register: teardown must be a function')
      }
      const id = nextId++
      entries.push({ id, fn })
      let removed = false
      return () => {
        if (removed) return
        removed = true
        const idx = entries.findIndex((e) => e.id === id)
        if (idx >= 0) entries.splice(idx, 1)
      }
    },

    get size() {
      return entries.length
    },

    async drain(timeoutMs?: number): Promise<DrainReport> {
      if (draining) {
        // Concurrent drain — return an empty report rather than racing.
        return {
          total: 0,
          ok: 0,
          errors: 0,
          timeouts: 0,
          outcomes: [],
        }
      }
      draining = true
      const budget =
        typeof timeoutMs === 'number' && timeoutMs > 0
          ? timeoutMs
          : defaultTimeoutMs

      // Splice everything out *before* iterating so re-entrant `register`
      // calls from a teardown don't get drained in this pass.
      const snapshot = entries.splice(0, entries.length)
      const outcomes: TeardownOutcome[] = []

      // LIFO: last registered = first disposed.
      for (let i = snapshot.length - 1; i >= 0; i--) {
        const entry = snapshot[i]
        if (!entry) continue
        // Each runs in isolation; we never re-throw to the caller.
        // eslint-disable-next-line no-await-in-loop -- sequential drain is the contract
        const outcome = await runWithTimeout(entry.fn, budget, i)
        outcomes.push(outcome)
      }

      draining = false
      let ok = 0
      let errors = 0
      let timeouts = 0
      for (const o of outcomes) {
        if (o.outcome === 'ok') ok++
        else if (o.outcome === 'error') errors++
        else timeouts++
      }
      return {
        total: outcomes.length,
        ok,
        errors,
        timeouts,
        outcomes,
      }
    },

    async [Symbol.asyncDispose](): Promise<void> {
      await this.drain()
    },

    async dispose(): Promise<void> {
      await this.drain()
    },
  }

  return registry
}

// ─── Plugin-wide singleton ──────────────────────────────────────────────────

/**
 * Single registry shared by the OC plugin process. Hooks at module load /
 * plugin init time register their teardown against this instance; the
 * plugin lifecycle drains it on shutdown (see `src/opencode-plugin/index.ts`).
 */
export const pluginCleanup: CleanupRegistry = createCleanupRegistry()

/**
 * Emit a structured warning when a drain reports any errors or timeouts.
 * Best-effort: never throws. Public so tests can stub stderr if needed.
 */
export function logDrainReport(report: DrainReport): void {
  if (report.errors === 0 && report.timeouts === 0) return
  try {
    const summary = {
      kind: 'cleanup_drain',
      total: report.total,
      ok: report.ok,
      errors: report.errors,
      timeouts: report.timeouts,
    }
    process.stderr.write(
      `[anvil] opencode-plugin: cleanup-registry drain had issues — ${JSON.stringify(
        summary,
      )}\n`,
    )
  } catch {
    // never throw from logging
  }
}
