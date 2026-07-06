/**
 * ANV-0203 (P5) — Interactive collision-resolution for `anvil extension install`.
 *
 * Layer 4 — commands leaf.
 * Imports from: layer 0 (core/templates/decision.ts), layer 7 (installer/extensions/).
 *
 * Three resolution channels, in priority order:
 *   1. ANVIL_HOST=claude-code → emit ANVIL_DECISION: JSON line, return host-prompt-emitted.
 *      Host harness intercepts the line, fires AskUserQuestion, re-invokes CLI with
 *      --on-collision=<choice>. Caller must exit 10 so the host knows to wait.
 *   2. TTY stdin → read 1|2|3|4 key, map to strategy. "2" prompts for rename slug.
 *   3. No channel → return no-channel with a message naming --on-collision.
 *
 * Recommendation logic (plan §5, D4):
 *   - All collisions Tier 1 → Replace recommended, confidence: 'medium'
 *   - Any Tier 2 → Abort recommended, confidence: 'high'
 *   - Tier 3 only → Abort recommended, confidence: 'low'
 */

import * as readline from 'node:readline'
import {
  type AskUserQuestionPayload,
  type DecisionPrompt,
  renderDecisionClaudeCode,
} from '../../../core/templates/decision.js'
import type {
  CollisionFinding,
  OnCollisionStrategy,
} from '../../../installer/extensions/install-pipeline.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export type ResolverContext = {
  manifestName: string
  manifestVersion: string
  collisions: CollisionFinding[]
  /** true when process.env.ANVIL_HOST === 'claude-code' */
  isHostClaude: boolean
  /** true when process.stdin.isTTY === true */
  isTTY: boolean
}

export type ResolverDecision =
  | { kind: 'strategy'; strategy: OnCollisionStrategy; rename?: string }
  | { kind: 'host-prompt-emitted' }
  | { kind: 'no-channel'; detail: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format collisions into a human-readable table for the decision explanation. */
function formatCollisionTable(collisions: CollisionFinding[]): string {
  const lines = collisions.map(
    (c) =>
      `  - Tier ${c.tier} / ${c.kind} '${c.slug}' — conflicts with ${c.conflictingSource}`,
  )
  return `Detected ${collisions.length} collision(s):\n${lines.join('\n')}`
}

/**
 * Compute recommendation based on collision tiers (plan §5, D4).
 * Returns { recommendReplace, recommendAbort, confidence }.
 */
function computeRecommendation(collisions: CollisionFinding[]): {
  recommendReplace: boolean
  recommendAbort: boolean
  confidence: 'low' | 'medium' | 'high'
} {
  const hasAnyTier2 = collisions.some((c) => c.tier === 2)
  const allTier1 = collisions.every((c) => c.tier === 1)

  if (hasAnyTier2) {
    return { recommendReplace: false, recommendAbort: true, confidence: 'high' }
  }
  if (allTier1) {
    return {
      recommendReplace: true,
      recommendAbort: false,
      confidence: 'medium',
    }
  }
  // Tier 3 only (no Tier 2, not all Tier 1)
  return { recommendReplace: false, recommendAbort: true, confidence: 'low' }
}

/** Build a DecisionPrompt for the collision set (plan §5, D3). */
function buildDecisionPrompt(ctx: ResolverContext): DecisionPrompt {
  const { manifestName, manifestVersion, collisions } = ctx
  const { recommendReplace, recommendAbort, confidence } =
    computeRecommendation(collisions)

  const prompt: DecisionPrompt = {
    question: `Install '${manifestName}' v${manifestVersion} — ${collisions.length} collision(s) detected. How should I proceed?`,
    explanation: formatCollisionTable(collisions),
    options: [
      {
        label: 'Replace',
        description:
          'Uninstall the conflicting extension(s) first, then install this one. Only available when all collisions are Tier 1 (installed-extension shadow).',
        ...(recommendReplace
          ? {
              recommended: true,
              rationale:
                'All conflicts are with previously-installed extensions — replacing is safe and predictable.',
            }
          : {}),
      },
      {
        label: 'Rename',
        description:
          'Install under a new name. You will be prompted for the new slug. Resolves Tier 1; Tier 2/3 still apply to provides[] slugs and may require further action.',
      },
      {
        label: 'Skip',
        description:
          'Leave both the installed extension and the bundled assets untouched. The archive is discarded.',
      },
      {
        label: 'Abort',
        description:
          'Cancel the install and exit non-zero. Use this when you need to investigate before deciding.',
        ...(recommendAbort
          ? {
              recommended: true,
              rationale:
                'One or more collisions shadow core or cross-extension slugs — aborting is the safest choice until you can review the conflict.',
            }
          : {}),
      },
    ],
    confidence,
  }

  return prompt
}

// ─── TTY stdin reader ─────────────────────────────────────────────────────────

/**
 * Read one line from a readline interface created over stdin.
 * Prompts the user with `promptText` and resolves with the raw line.
 */
async function readLineFromStdin(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    })
    rl.question(promptText, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * TTY interaction — present numbered menu and read choice.
 * Key mapping: 1→replace, 2→rename (+ slug prompt), 3→skip, 4→abort.
 */
async function resolveTTY(
  ctx: ResolverContext,
  stdinProvider?: () => Promise<string>,
): Promise<ResolverDecision> {
  const { manifestName, manifestVersion, collisions } = ctx
  const { recommendReplace, recommendAbort } = computeRecommendation(collisions)

  const replaceTag = recommendReplace ? ' (Recommended)' : ''
  const abortTag = recommendAbort ? ' (Recommended)' : ''

  const menu = [
    `\nInstall '${manifestName}' v${manifestVersion} — ${collisions.length} collision(s) detected.`,
    formatCollisionTable(collisions),
    '',
    'How should I proceed?',
    `  1) Replace${replaceTag}  — uninstall conflicting extension(s) first`,
    '  2) Rename    — install under a new name',
    '  3) Skip      — discard this archive, keep existing',
    `  4) Abort${abortTag}    — cancel and exit non-zero`,
    '',
  ].join('\n')

  process.stdout.write(menu)

  let choice: string
  if (stdinProvider) {
    const raw = await stdinProvider()
    choice = raw.trim()
  } else {
    const raw = await readLineFromStdin('Enter 1-4: ')
    choice = raw.trim()
  }

  if (choice === '1') {
    return { kind: 'strategy', strategy: 'replace' }
  }
  if (choice === '3') {
    return { kind: 'strategy', strategy: 'skip' }
  }
  if (choice === '4') {
    return { kind: 'strategy', strategy: 'abort' }
  }
  if (choice === '2') {
    // Prompt for rename slug
    let slug: string
    if (stdinProvider) {
      const raw = await stdinProvider()
      slug = raw.trim()
    } else {
      const raw = await readLineFromStdin('New slug for the extension: ')
      slug = raw.trim()
    }
    return { kind: 'strategy', strategy: 'rename', rename: slug }
  }

  // Invalid choice — default to abort for safety
  process.stderr.write(
    `anvil extension install: invalid choice '${choice}' — aborting.\n`,
  )
  return { kind: 'strategy', strategy: 'abort' }
}

// ─── Host path ────────────────────────────────────────────────────────────────

/**
 * Emit the AskUserQuestion payload on stdout as an ANVIL_DECISION: line.
 * The host harness intercepts this, fires AskUserQuestion, and re-invokes
 * the CLI with --on-collision=<choice>.
 */
function emitHostDecision(ctx: ResolverContext): void {
  const prompt = buildDecisionPrompt(ctx)
  const payload: AskUserQuestionPayload = renderDecisionClaudeCode(prompt)
  process.stdout.write(`ANVIL_DECISION:${JSON.stringify(payload)}\n`)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a collision interactively, using the appropriate channel.
 * The caller is responsible for exiting with the right code:
 *   host-prompt-emitted → exit 10
 *   no-channel          → exit 4
 *   strategy            → re-run pipeline with chosen strategy
 */
export async function resolveCollision(
  ctx: ResolverContext,
): Promise<ResolverDecision> {
  if (ctx.isHostClaude) {
    emitHostDecision(ctx)
    return { kind: 'host-prompt-emitted' }
  }

  if (ctx.isTTY) {
    return resolveTTY(ctx)
  }

  return {
    kind: 'no-channel',
    detail:
      'Re-run with --on-collision={skip|abort|fail|replace|rename} to specify a strategy non-interactively.',
  }
}

/**
 * Testable variant that accepts an injectable stdin reader.
 * Used by unit tests to avoid real readline interaction.
 */
export async function resolveCollisionWithStdin(
  ctx: ResolverContext,
  stdinProvider: () => Promise<string>,
): Promise<ResolverDecision> {
  if (ctx.isHostClaude) {
    emitHostDecision(ctx)
    return { kind: 'host-prompt-emitted' }
  }

  if (ctx.isTTY) {
    return resolveTTY(ctx, stdinProvider)
  }

  return {
    kind: 'no-channel',
    detail:
      'Re-run with --on-collision={skip|abort|fail|replace|rename} to specify a strategy non-interactively.',
  }
}
