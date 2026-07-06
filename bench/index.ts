/**
 * Anvil benchmark dispatcher.
 * Imports and runs each bench/*.ts module (except itself).
 * Emits structured JSON to stdout.
 *
 * Usage: npm run bench
 */
import { runSkillsLoadBenchmark } from './skills-load.js'

async function main(): Promise<void> {
  const results: Record<string, unknown> = {}

  process.stderr.write('[bench] skills-load...\n')
  results['skills-load'] = await runSkillsLoadBenchmark()

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
