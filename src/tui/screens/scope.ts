import { select } from '@clack/prompts'
import chalk from 'chalk'
import { Scope } from '../../core/types.js'

const HINT =
  "'project' writes into the current directory. 'global' writes into ~/. Global affects every repo."

/** Human-readable labels for each Scope enum value. D-03: derived from Zod enum. */
const SCOPE_LABELS: Record<
  (typeof Scope.options)[number],
  { label: string; hint?: string }
> = {
  project: { label: 'Project — this repo only (recommended)' },
  global: { label: 'Global — user-wide' },
}

export const FLAG_BINDING = {
  flag: 'scope',
  type: 'pre-seed' as const,
}

export function runScopeScreen(): Promise<Scope | symbol> {
  return select({
    message: `Install scope?\n${chalk.dim(HINT)}`,
    options: Scope.options.map((value) => ({
      value,
      label: SCOPE_LABELS[value].label,
      hint: SCOPE_LABELS[value].hint,
    })),
    initialValue: 'project' as Scope,
  }) as Promise<Scope | symbol>
}
