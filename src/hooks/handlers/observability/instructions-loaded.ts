/**
 * InstructionsLoaded observability handler — ANV-0023.
 *
 * Fires off the existing `session-start` HookKind. Its only job is to
 * capture a *baseline* snapshot of the rule sources loaded into the
 * session so a later PostCompact handler can detect rule-bearing
 * context that vanished after compaction.
 *
 * The handler is non-blocking and observational: it emits a single
 * info-severity `instructions-loaded` directive and writes a JSON
 * baseline snapshot to `.anvil/notepads/observability/`.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ObservabilityDirective,
  buildDirective,
} from '../../../core/observability/index.js'
import type { HookHandler } from '../../../core/types.js'
import {
  type RuleSnapshot,
  instructionsSnapshotPath,
  writeSnapshot,
} from './snapshot-store.js'

/**
 * Result returned by the pure transform — separated from the HookHandler
 * wrapper so tests can exercise the transform without I/O.
 */
export interface InstructionsLoadedResult {
  snapshot: RuleSnapshot
  directive: ObservabilityDirective
}

/** Rule sources we consider canonical for the baseline. */
const RULE_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/rules/anvil-routing.md',
]

/**
 * Pure transform. Given a list of `(name, bytes)` rule entries,
 * produce the baseline snapshot + emitted directive.
 *
 * Exported separately so unit tests can drive it without touching disk.
 */
export function buildInstructionsLoadedResult(
  rules: Array<{ name: string; bytes: number }>,
  now: Date = new Date(),
): InstructionsLoadedResult {
  const totalBytes = rules.reduce((s, r) => s + r.bytes, 0)
  const sourceNames = rules.map((r) => r.name)
  const snapshot: RuleSnapshot = {
    capturedAt: now.toISOString(),
    totalBytes,
    sourceNames,
  }
  const directive = buildDirective(
    'instructions-loaded',
    {
      totalBytes,
      ruleCount: rules.length,
      sourceNames,
    },
    { emittedAt: snapshot.capturedAt },
  )
  return { snapshot, directive }
}

/**
 * Scan the `cwd` for canonical rule sources and return their byte
 * sizes. Missing files are silently dropped. Never throws — failure
 * to read returns an empty list.
 */
export function scanRuleSources(
  cwd: string,
): Array<{ name: string; bytes: number }> {
  const out: Array<{ name: string; bytes: number }> = []
  for (const rel of RULE_CANDIDATES) {
    const abs = join(cwd, rel)
    try {
      if (!existsSync(abs)) continue
      const s = statSync(abs)
      if (s.isFile()) out.push({ name: rel, bytes: s.size })
    } catch {
      // ignore
    }
  }
  // Skill rule files under .claude/rules/ (excluding the routing file already counted).
  const rulesDir = join(cwd, '.claude', 'rules')
  try {
    if (existsSync(rulesDir)) {
      for (const e of readdirSync(rulesDir)) {
        if (!e.endsWith('.md')) continue
        const rel = join('.claude', 'rules', e)
        if (out.some((r) => r.name === rel)) continue
        try {
          const s = statSync(join(rulesDir, e))
          if (s.isFile()) out.push({ name: rel, bytes: s.size })
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return out
}

/**
 * HookHandler entry-point. Always returns exitCode 0; observational only.
 */
export const instructionsLoadedHandler: HookHandler = async (ctx) => {
  const rules = scanRuleSources(ctx.cwd)
  // Bytes are read via stat (cheap, no content I/O). This keeps the
  // handler under the 30-second dispatcher cap by construction.
  const { snapshot } = buildInstructionsLoadedResult(rules)
  writeSnapshot(instructionsSnapshotPath(ctx.cwd), snapshot)
  return { exitCode: 0 }
}
