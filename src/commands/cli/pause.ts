import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function pauseCommand(): Promise<void> {
  const anvilDir = join(process.cwd(), '.anvil')
  if (!existsSync(anvilDir)) mkdirSync(anvilDir, { recursive: true })

  const handoff: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  }
  try {
    handoff.branch = execSync('git branch --show-current', {
      encoding: 'utf-8',
    }).trim()
  } catch {
    /* not in git */
  }
  try {
    handoff.lastCommit = execSync('git log --oneline -1', {
      encoding: 'utf-8',
    }).trim()
  } catch {
    /* not in git */
  }
  try {
    handoff.status = execSync('git status --porcelain', {
      encoding: 'utf-8',
    }).trim()
  } catch {
    /* not in git */
  }

  writeFileSync(
    join(anvilDir, 'handoff.json'),
    JSON.stringify(handoff, null, 2),
  )
  console.log('Handoff saved to .anvil/handoff.json')
  console.log('Resume with: anvil resume')
}
