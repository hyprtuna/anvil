import chalk from 'chalk'
import type { EffortLevel } from '../../core/types.js'

/**
 * Color-coded text tag for a model alias or effort level.
 * Used by the preview screen to visualize the resolved models.json at a glance.
 *
 * - Opus   → magenta (max reasoning)
 * - Sonnet → cyan    (balanced)
 * - Haiku  → green   (fast, cheap)
 * - other  → gray    (custom / unknown alias)
 */
export function modelTag(modelOrAlias: string): string {
  const id = modelOrAlias.toLowerCase()
  if (id.includes('opus')) return chalk.bgMagenta.black(` ${modelOrAlias} `)
  if (id.includes('sonnet')) return chalk.bgCyan.black(` ${modelOrAlias} `)
  if (id.includes('haiku')) return chalk.bgGreen.black(` ${modelOrAlias} `)
  return chalk.bgGray.white(` ${modelOrAlias} `)
}

/**
 * Color-coded text tag for an effort level.
 *
 * - low    → gray
 * - medium → blue
 * - high   → yellow
 * - xhigh  → magenta
 * - max    → red
 */
export function effortTag(effort: EffortLevel): string {
  switch (effort) {
    case 'low':
      return chalk.gray(`[${effort}]`)
    case 'medium':
      return chalk.blue(`[${effort}]`)
    case 'high':
      return chalk.yellow(`[${effort}]`)
    case 'xhigh':
      return chalk.magenta(`[${effort}]`)
    case 'max':
      return chalk.red(`[${effort}]`)
  }
}

/**
 * Combined `<model> [effort]` tag used throughout the preview/execute screens.
 */
export function modelEffortTag(
  modelOrAlias: string,
  effort: EffortLevel,
): string {
  return `${modelTag(modelOrAlias)} ${effortTag(effort)}`
}
