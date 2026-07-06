import chalk from 'chalk'
import type { RoutingDecision } from './types.js'

/**
 * Renders a compact, single-line TUI banner describing the router's latest
 * routing decision (T4.8). Suitable for printing above an input prompt or
 * in a status panel. Stateless — pass the latest decision in and render.
 *
 * Format:
 *   ▶ intent (conf%) · agent · N skills · M rules[ · fallback][ · +K more]
 *
 * Returns an empty string when no decision is available so callers can
 * `console.log(renderRoutingBanner(decision))` unconditionally.
 */
export function renderRoutingBanner(
  decision: RoutingDecision | undefined | null,
): string {
  if (!decision) return ''
  if (decision.fallback === 'ask' && decision.candidates.length > 0) {
    return renderAskBanner(decision)
  }
  const pct = Math.round(decision.confidence * 100)
  const ruleCount =
    decision.rules.prompt.length +
    decision.rules.execution.length +
    decision.rules.safety.length +
    decision.rules.workflow.length
  const parts = [
    chalk.bold(`▶ ${decision.intent}`),
    chalk.dim(`(${pct}%)`),
    chalk.cyan(decision.agent),
    chalk.dim(`${decision.skills.length} skills`),
    chalk.dim(`${ruleCount} rules`),
  ]
  if (decision.fallback) {
    parts.push(chalk.yellow(`fallback=${decision.fallback}`))
  }
  if (decision.secondaryIntents.length > 0) {
    parts.push(chalk.dim(`+${decision.secondaryIntents.length} more`))
  }
  return parts.join(' · ')
}

/**
 * Renders the ask-mode banner used when the top two intents are tied
 * within `ASK_TIE_TOLERANCE`. The router cannot disambiguate, so it lists
 * the candidates and hints at `/skill` to pick one explicitly.
 *
 * Format:
 *   ▶ ambiguous · ask · candidates: debug, test · use /skill to pick
 */
function renderAskBanner(decision: RoutingDecision): string {
  const parts = [
    chalk.bold('▶ ambiguous'),
    chalk.yellow('ask'),
    chalk.dim(`candidates: ${decision.candidates.join(', ')}`),
    chalk.dim('use /skill to pick'),
  ]
  return parts.join(' · ')
}

/**
 * Renders a multi-line directive block used when the router is confident
 * enough to escalate the banner from advisory to directive. Consumers pick
 * between this and `renderRoutingBanner` via `isDirective(decision)` in
 * `src/intent/router.ts`.
 *
 * Format (ANSI colours collapsed for readability):
 *   ▶ DIRECTIVE — route to <agent> (<intent>, <pct>% confidence)
 *     skills:    <skill, skill, …>
 *     rules:     <rule, rule, …>
 *     secondary: <agent (intent), …>   (only when multi-intent)
 *     note:      High-confidence routing — delegate to the named agent
 *                before handling inline. Override with explicit /skill or
 *                @agent.
 */
export function renderRoutingDirective(decision: RoutingDecision): string {
  const pct = Math.round(decision.confidence * 100)
  const allRules = [
    ...decision.rules.prompt,
    ...decision.rules.execution,
    ...decision.rules.safety,
    ...decision.rules.workflow,
  ]
  const lines: string[] = [
    chalk.bold.magenta(
      `▶ DIRECTIVE — route to ${decision.agent} (${decision.intent}, ${pct}% confidence)`,
    ),
  ]
  if (decision.skills.length > 0) {
    lines.push(chalk.dim('  skills:    ') + decision.skills.join(', '))
  }
  if (allRules.length > 0) {
    lines.push(chalk.dim('  rules:     ') + allRules.join(', '))
  }
  if (decision.secondaryIntents.length > 0) {
    const sec = decision.secondaryIntents
      .map((s) => `${s.agent} (${s.intent})`)
      .join(', ')
    lines.push(chalk.dim('  secondary: ') + sec)
  }
  if (decision.chainPreview && decision.chainPreview.length > 0) {
    lines.push(chalk.dim('  chain:     ') + decision.chainPreview.join(' → '))
  }
  lines.push(
    chalk.dim(
      '  note:      High-confidence routing — delegate to the named agent before',
    ),
  )
  lines.push(
    chalk.dim(
      '             handling inline. Override with explicit /skill or @agent.',
    ),
  )
  return lines.join('\n')
}
