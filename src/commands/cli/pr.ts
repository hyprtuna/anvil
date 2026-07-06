import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { invokeSkill } from './common/invoke.js'
export async function prCommand(): Promise<void> {
  const cwd = process.cwd()
  if (existsSync(join(cwd, '.gitlab-ci.yml')))
    await invokeSkill('gitlab-workflow', 'Open an MR for the current branch')
  else await invokeSkill('github-workflow', 'Open a PR for the current branch')
}
