import { confirm } from '@clack/prompts'
import chalk from 'chalk'

const HINT =
  'Shows model, session cost, context %, and active agent at the bottom of Claude Code. Writes .claude/statusline.sh and a statusLine block to .claude/settings.json.'

export function runStatuslineScreen(): Promise<boolean | symbol> {
  return confirm({
    message: `Enable Claude Code status line?\n${chalk.dim(HINT)}`,
    initialValue: false,
  }) as Promise<boolean | symbol>
}
