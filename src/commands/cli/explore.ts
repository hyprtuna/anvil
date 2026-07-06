import { invokeSkill } from './common/invoke.js'
export async function exploreCommand(path?: string): Promise<void> {
  await invokeSkill(
    'project-exploration',
    `Path to explore: ${path ?? process.cwd()}`,
  )
}
