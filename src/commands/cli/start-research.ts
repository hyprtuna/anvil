import { invokeSkill } from './common/invoke.js'

export interface StartResearchOptions {
  json?: boolean
  quiet?: boolean
  depth?: 'quick' | 'coding' | 'planning'
}

export async function startResearchCommand(
  topic: string,
  opts: StartResearchOptions,
): Promise<void> {
  const depth = opts.depth ?? 'coding'
  await invokeSkill('deep-diving', `Topic: ${topic}\nDepth: ${depth}`)
}
