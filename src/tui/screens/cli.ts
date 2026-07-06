import { confirm } from '@clack/prompts'
import chalk from 'chalk'

const HINT =
  'Symlinks ~/.local/bin/anvil → ~/.anvil/bin/anvil.cjs so `anvil` is on PATH. Make sure ~/.local/bin is in your $PATH.'

export function runCliScreen(): Promise<boolean | symbol> {
  return confirm({
    message: `Add the \`anvil\` CLI to your PATH?\n${chalk.dim(HINT)}`,
    initialValue: true,
  }) as Promise<boolean | symbol>
}
