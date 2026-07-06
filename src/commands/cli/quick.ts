import { invokeSkill } from './common/invoke.js'

export interface QuickOptions {
  json?: boolean
  quiet?: boolean
  validate?: boolean
  discuss?: boolean
  research?: boolean
  save?: boolean
}

export async function quickCommand(
  description: string,
  opts: QuickOptions,
): Promise<void> {
  const flags: string[] = []
  if (opts.validate) flags.push('validate')
  if (opts.discuss) flags.push('discuss')
  if (opts.research) flags.push('research')
  if (opts.save) flags.push('save')
  const suffix = flags.length > 0 ? `\nFlags: ${flags.join(', ')}` : ''
  await invokeSkill('feature-development', `Task: ${description}${suffix}`)
}
