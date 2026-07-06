import { readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../core/io/project-scoped-paths.js'
import { dispatchAgent } from './agents/dispatch.js'
import { loadAgents } from './agents/registry.js'
import type { ParsedAgent } from './agents/schema.js'
import { logDrainReport, pluginCleanup } from './cleanup-registry.js'
import { dispatchOcAfter, dispatchOcBefore } from './hooks/dispatcher.js'

// ─── active-routing.json reader (Plan 31 B3 / ANV-0043) ─────────────────────

/**
 * Marker injected as a prefix on the prepended system message.
 * Its presence in the message array guarantees idempotency — we never
 * inject the routing directive twice on the same prompt.
 */
const ROUTING_MARKER = '<!-- anvil-routing -->'

/**
 * Parse `systemInsert` from a raw JSON string.
 * Returns the string value when valid, otherwise `undefined`.
 */
function parseSystemInsert(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'systemInsert' in parsed &&
      typeof (parsed as Record<string, unknown>).systemInsert === 'string'
    ) {
      return (parsed as { systemInsert: string }).systemInsert
    }
  } catch {
    // ignore
  }
  return undefined
}

/**
 * Read `active-routing.json` for the current session (ANV-0043).
 *
 * Strategy (session-scoped first, legacy fallback):
 * 1. Look under `~/.anvil/sessions/` for the most-recently-written session
 *    directory that contains `active-routing.json`. OpenCode runs as a single
 *    process per session, so the newest entry is always the current one.
 * 2. Fall back to the legacy project-relative path `{anvilRoot}/.anvil/active-routing.json`
 *    for pre-ANV-0043 installs and test environments.
 *
 * Best-effort: any I/O error results in `undefined`.
 */
async function readActiveRouting(
  anvilRoot: string,
): Promise<string | undefined> {
  // ── 1. Session-scoped lookup ─────────────────────────────────────────────
  try {
    const sessionsDir = join(homedir(), '.anvil', 'sessions')
    const entries = readdirSync(sessionsDir)
    // Find the most-recently-modified session directory that has active-routing.json
    let bestMtime = 0
    let bestContent: string | undefined
    for (const entry of entries) {
      const candidate = join(sessionsDir, entry, 'active-routing.json')
      try {
        const st = statSync(candidate)
        if (st.mtimeMs > bestMtime) {
          const raw = readFileSync(candidate, 'utf-8')
          const insert = parseSystemInsert(raw)
          if (insert !== undefined) {
            bestMtime = st.mtimeMs
            bestContent = insert
          }
        }
      } catch {
        // entry missing or unreadable — skip
      }
    }
    if (bestContent !== undefined) return bestContent
  } catch {
    // sessions dir doesn't exist — fall through to legacy
  }

  // ── 2. Per-project path fallback ────────────────────────────────────────
  try {
    await ensureProjectDir(anvilRoot)
    const projectRoutingPath = await getProjectScopedPath(
      anvilRoot,
      'active-routing',
    )
    const raw = await readFile(projectRoutingPath, 'utf-8')
    return parseSystemInsert(raw)
  } catch {
    // Missing or corrupt file — silently no-op.
  }
  return undefined
}

// ─── ANV-0097: plugin shutdown wiring ───────────────────────────────────────

/** Module-level guard so we only attach signal handlers once per process. */
let shutdownHandlersInstalled = false
/** Module-level guard so concurrent triggers don't double-drain. */
let draining = false

/**
 * Drain the plugin-wide cleanup registry. Safe to call multiple times —
 * second and subsequent calls during an in-flight drain are no-ops. Never
 * throws: every registered teardown is wrapped by the registry itself.
 *
 * Exported for tests; in production callers should not invoke this directly.
 */
export async function shutdownAnvilPlugin(): Promise<void> {
  if (draining) return
  draining = true
  try {
    const report = await pluginCleanup.drain()
    logDrainReport(report)
  } catch {
    // Defense in depth — pluginCleanup.drain() is already designed not to
    // reject, but we never propagate from shutdown.
  } finally {
    draining = false
  }
}

/**
 * Bind `shutdownAnvilPlugin` to the OS / Node lifecycle so plugin reload
 * or process exit drains the registry. Idempotent — re-invocations after
 * the first are no-ops (Plan 31 hot-reload safety).
 */
function installShutdownHandlers(): void {
  if (shutdownHandlersInstalled) return
  shutdownHandlersInstalled = true

  // beforeExit fires when the event loop empties — natural OC plugin
  // unload. Signal handlers cover host-process termination.
  const handler = (): void => {
    void shutdownAnvilPlugin()
  }
  process.once('beforeExit', handler)
  process.once('SIGINT', handler)
  process.once('SIGTERM', handler)
}

// Test-only: reset module-level state so individual tests can install
// fresh handlers without inheriting flags from earlier specs.
export function __resetShutdownHandlersForTests(): void {
  shutdownHandlersInstalled = false
  draining = false
}

// The compiled plugin lives at ~/.anvil/plugins/opencode/index.js.
// Going up 2 levels from that path reaches ~/.anvil, which is ANVIL_ROOT.
const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the Anvil root directory.
 * Production: two levels up from the compiled plugin location (~/.anvil).
 * Test-only escape hatch: ANVIL_ROOT_OVERRIDE env var points at a temp dir.
 * Do not document or rely on ANVIL_ROOT_OVERRIDE outside test fixtures.
 */
function resolveAnvilRoot(): string {
  // test-only; do not document
  if (process.env.ANVIL_ROOT_OVERRIDE) return process.env.ANVIL_ROOT_OVERRIDE
  return join(__dirname, '..', '..')
}

const BOOTSTRAP_MARKER = '<!-- anvil:bootstrap -->'

// ─── enabled-skills reader (ANV-0014 — versioned manifest contract) ──────────

/**
 * Read ~/.anvil/manifest.json and return the directory path of every skill
 * whose `enabled` flag is `true`.
 *
 * Contract (ANV-0014):
 *   - File absent → graceful no-op; returns []. Fresh installs before a real
 *     `anvil init` has run are expected to have no manifest.
 *   - File present, `schemaVersion !== "anvil.opencode.v1"` → structured error;
 *     returns []. The installer writes this field; a mismatch means a stale or
 *     foreign manifest that Anvil should not silently consume.
 *   - File present, valid schema → returns paths for all enabled skills.
 *
 * Validation is intentionally manual (no Zod import): the plugin runs inside
 * OpenCode's process where importing Zod would add ~50KB of overhead.
 * Boundary validation lives in src/core/types.ts where the manifest is *written*.
 */
const MANIFEST_SCHEMA_VERSION = 'anvil.opencode.v1'

async function readEnabledSkills(anvilRoot: string): Promise<string[]> {
  const manifestPath = join(anvilRoot, 'manifest.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') {
      // Absent manifest is normal on a fresh env — graceful no-op.
      return []
    }
    process.stderr.write(
      `[anvil] opencode-plugin: manifest.json unreadable (${err instanceof Error ? err.message : String(err)}); no skills registered\n`,
    )
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    process.stderr.write(
      '[anvil] opencode-plugin: manifest.json contains invalid JSON; no skills registered. Re-run `anvil init` to repair.\n',
    )
    return []
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    process.stderr.write(
      '[anvil] opencode-plugin: manifest.json is not a JSON object; no skills registered. Re-run `anvil init` to repair.\n',
    )
    return []
  }

  const manifest = parsed as Record<string, unknown>
  const schemaVersion = manifest.schemaVersion

  if (schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    // Present but wrong version — fail loud (ANV-0013 pattern). This means
    // the manifest was written by an older Anvil that didn't populate skills.
    // Re-running `anvil init` will upgrade it.
    process.stderr.write(
      `[anvil] opencode-plugin: manifest.json has schemaVersion "${String(schemaVersion ?? '<missing>')}" (expected "${MANIFEST_SCHEMA_VERSION}"); no skills registered. Re-run \`anvil init\` to upgrade the manifest.\n`,
    )
    return []
  }

  if (!Array.isArray(manifest.skills)) {
    process.stderr.write(
      '[anvil] opencode-plugin: manifest.json is missing the "skills" array; no skills registered. Re-run `anvil init` to repair.\n',
    )
    return []
  }

  const out: string[] = []
  for (const entry of manifest.skills as Array<unknown>) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      typeof (entry as { name: unknown }).name === 'string' &&
      'enabled' in entry &&
      (entry as { enabled: unknown }).enabled === true
    ) {
      out.push(join(anvilRoot, 'skills', (entry as { name: string }).name))
    }
  }
  return out
}

/**
 * Message type for the transform handler.
 * Uses an open-ended intersection so OpenCode can attach extra envelope fields
 * (e.g. id, timestamp) without breaking the plugin (D-12 .passthrough() semantics).
 */
type OcPluginMessage = { role: string; content: string } & Record<
  string,
  unknown
>

interface AnvilPluginHooks {
  config(config: { skills?: { paths?: string[] } }): Promise<void>
  'tool.execute.before'?(
    input: { tool: string; sessionID: string; callID: string },
    output: { args: Record<string, unknown>; message?: string },
  ): Promise<void>
  'tool.execute.after'?(
    input: { tool: string; sessionID: string; callID: string },
    output: {
      title: string
      output: string
      metadata: Record<string, unknown>
    },
  ): Promise<void>
  experimental?: {
    chat?: {
      messages?: {
        transform?(
          messages: Array<OcPluginMessage>,
        ): Promise<Array<OcPluginMessage>>
      }
    }
  }
}

export async function AnvilPlugin(): Promise<AnvilPluginHooks> {
  // Resolve root at plugin instantiation time so ANVIL_ROOT_OVERRIDE is
  // respected even after module load (integration test hatch, D-11).
  const anvilRoot = resolveAnvilRoot()
  const skillsPath = join(anvilRoot, 'skills')
  const bootstrapSkillPath = join(
    anvilRoot,
    'skills',
    'using-anvil',
    'SKILL.md',
  )

  // Read the bootstrap skill content eagerly so we don't re-read on every
  // request. ANV-0013: this is a load-bearing contract — missing or empty
  // bootstrap content is a hard failure, not a silent skip. The previous
  // silent-swallow branch caused every OpenCode session to boot without the
  // Anvil discovery doctrine for end-users on `anvil init --target opencode`.
  const bootstrapContent = await readFile(bootstrapSkillPath, 'utf-8')
  if (bootstrapContent.trim().length === 0) {
    throw new Error(
      `[anvil] opencode-plugin: bootstrap skill is empty at ${bootstrapSkillPath}. Re-run \`anvil init --target opencode\` to restage skills/using-anvil/SKILL.md.`,
    )
  }

  // Load agents once at plugin init (D-04). Returns empty Map when agents/
  // dir is absent or empty — that is not an error (D-10).
  let agentMap: Map<string, ParsedAgent>
  try {
    agentMap = await loadAgents(anvilRoot)
  } catch {
    // Catastrophic failure — loadAgents itself already swallows per-file errors.
    // This catch is a last-resort guard; never throw from plugin init.
    agentMap = new Map()
  }

  // ANV-0097: register the plugin-instance state (agent map) with the
  // cleanup-registry. The hook + manifest caches register themselves at
  // module load; the agent map is created per AnvilPlugin() invocation
  // and so must be registered here. LIFO ordering means agentMap clears
  // first when the plugin tears down — see cleanup-registry.ts.
  pluginCleanup.register(() => {
    agentMap.clear()
  })

  // Bind the cleanup drain to process lifecycle so plugin shutdown
  // (signal or natural exit) drains every registered teardown. Guarded
  // by a module-level flag so duplicate signals or repeated
  // AnvilPlugin() invocations don't double-drain.
  installShutdownHandlers()

  return {
    async config(cfg) {
      // OC 1.15.3 invokes the config hook with `undefined` in some startup
      // paths (provider list bootstrap). Defensive no-op when there's nothing
      // to mutate — the config object is owned by OC, not us.
      if (!cfg || typeof cfg !== 'object') return
      cfg.skills ??= {}
      cfg.skills.paths ??= []
      // Register every enabled skill from the manifest (D-05, D-06).
      const enabled = await readEnabledSkills(anvilRoot)
      for (const path of enabled) {
        if (!cfg.skills.paths.includes(path)) {
          cfg.skills.paths.push(path)
        }
      }
      // Always include the bootstrap skill root for using-anvil discoverability,
      // even on a fresh install before manifest.json exists (D-06).
      if (!cfg.skills.paths.includes(skillsPath)) {
        cfg.skills.paths.push(skillsPath)
      }
    },

    // ── Hook dispatch — tool.execute.before (blocking) ───────────────────────
    // Throws OcHookBlockedError when any registered hook returns exitCode 2,
    // which causes OC to abort the tool call (D-04, confirmed B1.1).
    async 'tool.execute.before'(input, output) {
      await dispatchOcBefore({ input, output, cwd: anvilRoot, anvilRoot })
    },

    // ── Hook dispatch — tool.execute.after (advisory) ────────────────────────
    // Never throws. Hook failures are logged to oc-hook-failures.jsonl (D-04).
    async 'tool.execute.after'(input, output) {
      await dispatchOcAfter({ input, output, cwd: anvilRoot, anvilRoot })
    },

    experimental: {
      chat: {
        messages: {
          async transform(messages) {
            let result = messages

            // Plan 31 B3: Prepend routing directive from disk-backed
            // .anvil/active-routing.json when present and not already
            // injected (marker-guarded idempotency).
            const systemInsert = await readActiveRouting(anvilRoot)
            if (
              systemInsert &&
              !result.some((m) => m.content.includes(ROUTING_MARKER))
            ) {
              result = [
                {
                  role: 'system',
                  content: `${ROUTING_MARKER}\n${systemInsert}`,
                },
                ...result,
              ]
            }

            // Bundle C: Agent persona injection via leading @anvil:<slug> mention.
            // Runs after routing directive (which is always first/system) but
            // before bootstrap-skill injection so the persona appears as the
            // second system message. Order: routing → agent-persona → bootstrap.
            result = await dispatchAgent(result, agentMap)

            // Only inject when the first user message doesn't already contain
            // the bootstrap marker (idempotent across hot-reloads).
            const firstUser = result.find((m) => m.role === 'user')
            if (firstUser && !firstUser.content.includes(BOOTSTRAP_MARKER)) {
              const firstUserIdx = result.indexOf(firstUser)
              return [
                ...result.slice(0, firstUserIdx),
                {
                  ...firstUser,
                  content: `${BOOTSTRAP_MARKER}\n${bootstrapContent}\n\n${firstUser.content}`,
                },
                ...result.slice(firstUserIdx + 1),
              ]
            }
            return result
          },
        },
      },
    },
  }
}

// Default export so OpenCode can `import AnvilPlugin from './index.js'`.
export default AnvilPlugin

// OC 1.15.3 PluginModule contract: the plugin function must be exported as
// `server`. The older `AnvilPlugin` + `default` exports stay for back-compat
// with earlier OC versions and our own integration tests.
export const server = AnvilPlugin
