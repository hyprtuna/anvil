import { invokeSkill } from './common/invoke.js'
export async function tddCommand(feature: string): Promise<void> {
  await invokeSkill('test-driven-development', `Feature to TDD: ${feature}`)
}
