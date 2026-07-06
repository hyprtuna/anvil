import { select } from '@clack/prompts'
import chalk from 'chalk'
import { Target } from '../../core/types.js'

const HINT =
  "Which client to install into. 'both' writes .claude-plugin/ and .opencode/."

/** Human-readable labels for each Target enum value. D-03: derived from Zod enum. */
const TARGET_LABELS: Record<
  (typeof Target.options)[number],
  { label: string; hint?: string }
> = {
  both: { label: 'Both — Claude Code + OpenCode (recommended)' },
  'claude-code': { label: 'Claude Code only' },
  opencode: { label: 'OpenCode only' },
}

export const FLAG_BINDING = {
  flag: 'target',
  type: 'pre-seed' as const,
}

export function runTargetScreen(): Promise<Target | symbol> {
  return select({
    message: `Which target(s)?\n${chalk.dim(HINT)}`,
    options: Target.options.map((value) => ({
      value,
      label: TARGET_LABELS[value].label,
      hint: TARGET_LABELS[value].hint,
    })),
    initialValue: 'both' as Target,
  }) as Promise<Target | symbol>
}
