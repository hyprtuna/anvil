import { select } from '@clack/prompts'
import chalk from 'chalk'
import { PresetName } from '../../core/types.js'

const HINT =
  'Model preset. balanced = default. cost-optimised = Haiku-first. max-quality = Opus-heavy. speed-first = Haiku + minimal chains.'

/** Human-readable labels for each PresetName enum value. D-03: derived from Zod enum. */
const PRESET_LABELS: Record<
  (typeof PresetName.options)[number],
  { label: string; hint?: string }
> = {
  balanced: {
    label: 'Balanced (recommended)',
    hint: 'Sonnet default, Opus for planning',
  },
  'cost-optimised': { label: 'Cost-optimised', hint: 'Haiku heavy' },
  'max-quality': { label: 'Max quality', hint: 'Opus everywhere' },
  'speed-first': { label: 'Speed-first', hint: 'Haiku default' },
}

export const FLAG_BINDING = {
  flag: 'preset',
  type: 'pre-seed' as const,
}

export function runModelsScreen(): Promise<PresetName | symbol> {
  return select({
    message: `Which model preset?\n${chalk.dim(HINT)}`,
    options: PresetName.options.map((value) => ({
      value,
      label: PRESET_LABELS[value].label,
      hint: PRESET_LABELS[value].hint,
    })),
    initialValue: 'balanced' as PresetName,
  }) as Promise<PresetName | symbol>
}
