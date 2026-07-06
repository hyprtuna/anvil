/**
 * Project-context signals — pure functions that take a prompt plus the
 * detected `ProjectContext` and return per-intent score deltas. Applied
 * between `detectIntents` and `pickTopIntent` to let the router boost or
 * suppress intents based on what the repo actually is.
 *
 * Deltas are *additive* on top of keyword scores. A signal that wants to
 * veto an intent should produce a delta at least as large as the intent's
 * strongest keyword weight (typically 10).
 *
 * Stays prompt-only when `ctx` is undefined — the hook handler runs on
 * every prompt and cannot always afford a disk-reading detection pass, so
 * context-aware routing is opportunistic, not required.
 */

import type { ProjectContext } from '../core/types.js'
import type { IntentName } from './intents.js'

export type IntentDeltas = Partial<Record<IntentName, number>>

const TEST_FILE_RE = /\b\w+\.(?:test|spec)\.[jt]sx?\b/
const UI_FRAMEWORKS = new Set(['react', 'vue', 'svelte', 'next', 'solid'])
const UI_WORDS_RE = /\b(component|page|style|layout|css|theme)\b/
const TYPE_WORDS_RE = /\b(type|generic|interface|tsdoc|declaration)\b/
const RELEASE_WORDS_RE = /\b(release|ship|tag|cut)\b/

/**
 * Computes score deltas to apply to the detected-intents list.
 * Each delta is an integer in the same units as keyword weights.
 *
 * Current signals:
 *   - test runner is installed AND prompt names a .test. or .spec. file →
 *       test +2, debug +1
 *   - UI framework (React/Vue/Svelte/Next) AND UI word in prompt →
 *       explore +1, refactor +1
 *   - top language is TypeScript AND prompt mentions types/interfaces →
 *       refactor +1, debug +1
 *   - a CI release workflow exists AND prompt mentions release words →
 *       plan +1, review +1
 *   - mid-rebase or merge conflict → refactor −10, plan −10 (veto)
 */
export function computeIntentDeltas(
  prompt: string,
  ctx: ProjectContext | undefined,
): IntentDeltas {
  if (!ctx) return {}
  const lower = prompt.toLowerCase()
  const deltas: IntentDeltas = {}

  const addDelta = (intent: IntentName, n: number): void => {
    deltas[intent] = (deltas[intent] ?? 0) + n
  }

  if (ctx.testRunners.length > 0 && TEST_FILE_RE.test(lower)) {
    addDelta('test', 2)
    addDelta('debug', 1)
  }

  const hasUiFramework = ctx.frameworks.some((f) =>
    UI_FRAMEWORKS.has(f.toLowerCase()),
  )
  if (hasUiFramework && UI_WORDS_RE.test(lower)) {
    addDelta('explore', 1)
    addDelta('refactor', 1)
  }

  const topLanguage = ctx.languages[0]?.name.toLowerCase()
  if (topLanguage === 'typescript' && TYPE_WORDS_RE.test(lower)) {
    addDelta('refactor', 1)
    addDelta('debug', 1)
  }

  const hasReleaseCi = ctx.ci.some((c) => /release|tag|publish/i.test(c))
  if (hasReleaseCi && RELEASE_WORDS_RE.test(lower)) {
    addDelta('plan', 1)
    addDelta('review', 1)
  }

  return deltas
}
