import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export async function resumeCommand(): Promise<void> {
  const handoffPath = join(process.cwd(), '.anvil', 'handoff.json')
  if (!existsSync(handoffPath)) {
    console.log('No handoff file found. Nothing to resume.')
    return
  }

  const handoff = JSON.parse(readFileSync(handoffPath, 'utf-8'))
  console.log(`Paused at: ${handoff.timestamp ?? 'unknown'}`)
  console.log(`Branch: ${handoff.branch ?? 'unknown'}`)
  console.log(`Last commit: ${handoff.lastCommit ?? 'unknown'}`)
  if (handoff.status) {
    console.log('Uncommitted changes:')
    for (const line of (handoff.status as string).split('\n'))
      console.log(`  ${line}`)
  }
  console.log('\nReady to continue. Run `anvil progress` for current state.')
}
