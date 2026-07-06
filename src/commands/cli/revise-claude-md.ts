import { invokeSkill } from './common/invoke.js'

export interface ReviseCmdOptions {
  focus?: string
  scope?: string
}

export function buildClaudeMdContext(opts: ReviseCmdOptions): string {
  const scope = opts.scope ?? 'project'
  const parts = [`Audit and improve CLAUDE.md files at ${scope} scope.`]
  if (opts.focus) {
    parts.push(`Focus area: ${opts.focus}`)
  }
  return parts.join('\n')
}

export async function reviseClamdeMdCommand(
  opts: ReviseCmdOptions,
): Promise<void> {
  const context = buildClaudeMdContext(opts)
  await invokeSkill('claude-md-improvement', context)
}
