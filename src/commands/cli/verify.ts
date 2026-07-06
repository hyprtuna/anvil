import { invokeSkill } from './common/invoke.js'

export interface VerifyOptions {
  json?: boolean
  quiet?: boolean
  phase?: string
}

export async function verifyCommand(opts: VerifyOptions): Promise<void> {
  const parts = ['Verify current state: run tests, typecheck, lint']
  if (opts.phase) parts.push(`Phase: ${opts.phase}`)
  await invokeSkill('verification', parts.join('\n'))
}
